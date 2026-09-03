/**
 * tools.ts — MCP tool catalog (Plane 1).
 *
 * Each tool wraps an API route that already exists in this app. Nothing here
 * reimplements generation logic; it adapts the routes to MCP call/result shapes.
 * See MCP_PLAN.md § Tool catalog.
 */

import { z } from "zod";

import {
  RELAY_DEFAULT_TIMEOUT_MS,
  isRelayedTool,
  type FillAnswer,
  type FormField,
  type RelayedTool,
} from "./relay-contract";
import { NoExtensionError, callRelay, sessionCount } from "./relay-hub";
import { pdfArtifacts, resumeOptimizations } from "./store";
import { NO_PROFILE_HINT, loadWorkspace } from "./workspace-source";
import type { Profile } from "@/app/lib/profile-model";

/**
 * Hands-free mode: the pipeline runs end to end without stopping to ask.
 *
 * The two gates still exist and still show the user what is happening — the
 * resume draft is reported in the reply, and the fill is narrated live in the
 * page — but neither blocks on a click, which is what a demo (and an agent
 * driving the whole application) needs. Set RO_HANDS_FREE=0 to get the
 * stop-and-ask wording back, and roAutoApprove:false in the extension's
 * chrome.storage.local to get the in-page approval dialog back.
 */
const HANDS_FREE = process.env.RO_HANDS_FREE !== "0";

export type ToolContext = {
  /** Origin of the running app, derived from the incoming request. */
  origin: string;
};

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export type ToolDef = {
  name: string;
  title: string;
  description: string;
  schema: z.ZodType;
  readOnly: boolean;
  run: (input: never, ctx: ToolContext) => Promise<ToolResult>;
};

// ─── helpers ─────────────────────────────────────────────────────────────────

function ok(data: unknown): ToolResult {
  return {
    content: [
      { type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) },
    ],
  };
}

function fail(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Calls /api/ai/generate over HTTP rather than importing its handler, so the
 * 812-line route keeps a single code path and its provider/header logic,
 * retry ladder and error messages are reused exactly as the UI gets them.
 */
async function callGenerate(
  ctx: ToolContext,
  body: Record<string, unknown>,
  timeoutMs = 0,
): Promise<{ ok: true; json: unknown } | { ok: false; error: string }> {
  const { profile, workspace, source } = await loadWorkspace();
  if (source === "empty") return { ok: false, error: NO_PROFILE_HINT };

  const s = workspace.settings;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-ai-provider": s.aiProvider ?? "gemini",
  };
  if ((s.aiProvider ?? "gemini") === "ollama") {
    headers["x-ollama-base-url"] = s.ollamaBaseUrl ?? "http://127.0.0.1:11434";
    headers["x-ollama-model"] = s.ollamaModel ?? "llama3.2";
  } else if (s.geminiApiKey?.trim()) {
    headers["x-gemini-api-key"] = s.geminiApiKey.trim();
  }

  let res: Response;
  try {
    res = await fetch(`${ctx.origin}/api/ai/generate`, {
      method: "POST",
      headers,
      // A local Ollama can take minutes per answer, which blows past every MCP
      // client's call timeout. Callers that have a usable fallback pass a budget
      // here and treat the abort as "no AI answer", not as a failure.
      signal: timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined,
      body: JSON.stringify({
        profile,
        skillsMd: s.skillsMd ?? "",
        personalContext: s.personalContext ?? "",
        ...body,
      }),
    });
  } catch (e) {
    const aborted = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return {
      ok: false,
      error: aborted
        ? `AI generation exceeded the ${timeoutMs}ms budget.`
        : `AI generation could not be reached: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: `AI generation failed (${res.status}): ${text.slice(0, 800)}` };
  }
  return { ok: true, json: await res.json() };
}

/** Loose match so "Phone*" and "Phone Number" both hit a saved "Phone" template. */
function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/\*/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set([
  "the","a","an","of","to","in","for","you","your","are","is","do","does","and",
  "or","that","this","with","will","would","have","has","any","please","select",
  "if","on","at","us","only","candidates","following","which","what","how",
]);

function tokens(q: string): Set<string> {
  return new Set(
    normalizeQuestion(q).split(" ").filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  );
}

/** Jaccard overlap on content words — far safer than substring containment. */
function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

/**
 * Finds the user's saved answer for a form question.
 *
 * `options` matters: a form question with radio options only accepts one of
 * those options, so a saved free-text answer (a phone number, a country code)
 * must never be offered for it. That mismatch is what made a saved phone number
 * try to answer the SMS-consent radio, which also carries the label "Phone".
 */
function findSavedAnswer(
  question: string,
  docs: Array<{ question: string; templateAnswer: string; title: string; source: string }>,
  options?: string[],
) {
  const target = normalizeQuestion(question);
  if (!target) return null;

  const candidates = docs.filter((d) => (d.templateAnswer ?? "").trim());
  const fitsField = (answer: string) => {
    if (!options?.length) return true;
    const a = answer.trim().toLowerCase();
    return options.some(
      (o) => o.trim().toLowerCase() === a || o.trim().toLowerCase().includes(a) || a.includes(o.trim().toLowerCase()),
    );
  };

  const exact = candidates.find(
    (d) => normalizeQuestion(d.question || d.title) === target && fitsField(d.templateAnswer),
  );
  if (exact) return exact;

  let best: { doc: (typeof candidates)[number]; score: number } | null = null;
  for (const d of candidates) {
    if (!fitsField(d.templateAnswer)) continue;
    const score = similarity(d.question || d.title, question);
    if (score >= 0.6 && (!best || score > best.score)) best = { doc: d, score };
  }
  return best?.doc ?? null;
}

/**
 * Demo fallbacks for choice fields the user has never saved an answer to.
 * Deliberately excludes self-identification (gender, race, veteran, disability)
 * — those come from saved answers or not at all.
 */
const CHOICE_DEFAULTS: Array<{ match: RegExp; prefer: string[] }> = [
  { match: /preferred programming language|interview.*language/i, prefer: ["python"] },
  { match: /employment eligible|seeking to work|which country/i, prefer: ["united states", "us"] },
  { match: /legally authorized|authorized to work|work authorization/i, prefer: ["yes"] },
  { match: /require sponsorship|visa sponsorship/i, prefer: ["yes"] },
  { match: /understand that all employees|coordination hours|core hours|acknowledge/i, prefer: ["yes"] },
  { match: /consent to receiv|text message|sms/i, prefer: ["yes - i consent", "yes"] },
  { match: /how did you (find out|hear)/i, prefer: ["linkedin"] },
];

function pickDefaultOption(label: string, options: string[]): string | null {
  const rule = CHOICE_DEFAULTS.find((r) => r.match.test(label));
  if (!rule) return null;
  for (const want of rule.prefer) {
    const hit = options.find((o) => o.trim().toLowerCase().startsWith(want))
      ?? options.find((o) => o.trim().toLowerCase().includes(want));
    if (hit) return hit;
  }
  return null;
}

/** Same idea as CHOICE_DEFAULTS, for plain text inputs with no saved answer. */
const TEXT_DEFAULTS: Array<{ match: RegExp; value: string }> = [
  { match: /how did you (find out|hear)/i, value: "LinkedIn" },
  { match: /referr?ed by|referral/i, value: "" },
];

function pickTextDefault(label: string): string | null {
  const rule = TEXT_DEFAULTS.find((r) => r.match.test(label));
  return rule?.value || null;
}

/**
 * Writes a free-text answer straight from the user's own personal-context notes,
 * with no model in the loop.
 *
 * This is the fallback that keeps autofill_page usable when generation is slow
 * or unavailable (a local Ollama answers in minutes, and an expired API key not
 * at all). It never invents anything: every sentence is text the user wrote.
 * Paragraphs are scored against the question, then re-joined in document order
 * so the answer still reads as prose.
 */
function composeFromPersonalContext(
  question: string,
  personalContext: string,
  maxChars: number,
): string {
  const limit = maxChars > 0 ? maxChars : 1400;
  const blocks = personalContext
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (!blocks.length) return "";

  let heading = "";
  const paras: Array<{ index: number; text: string; score: number }> = [];
  blocks.forEach((block, index) => {
    if (block.startsWith("#")) {
      heading = block.replace(/^#+\s*/, "");
      return;
    }
    if (block.length < 60) return;
    paras.push({ index, text: block, score: similarity(`${heading} ${block}`, question) });
  });
  if (!paras.length) return "";

  const ranked = [...paras].sort((a, b) => b.score - a.score);
  const picked: typeof paras = [];
  let used = 0;
  for (const p of ranked) {
    const cost = p.text.length + (picked.length ? 2 : 0);
    if (used + cost > limit) continue;
    picked.push(p);
    used += cost;
    if (used > limit * 0.75) break;
  }
  if (!picked.length) return trimToLimit(ranked[0].text, limit);

  return picked
    .sort((a, b) => a.index - b.index)
    .map((p) => p.text)
    .join("\n\n");
}

/** File uploads are handled by attach_resume, not by typing text. */
function isFileField(label: string, type: string): boolean {
  return type === "file" || /^resume$|cover letter|autofill from resume|upload/i.test(label.trim());
}

/** Cuts at the last sentence end that fits, falling back to a word boundary. */
function trimToLimit(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const window = text.slice(0, limit);
  const sentenceEnd = Math.max(
    window.lastIndexOf(". "), window.lastIndexOf("! "), window.lastIndexOf("? "),
  );
  if (sentenceEnd > limit * 0.5) return window.slice(0, sentenceEnd + 1).trim();
  const wordEnd = window.lastIndexOf(" ");
  return (wordEnd > 0 ? window.slice(0, wordEnd) : window).trim();
}

/**
 * Picks the profile entries that overlap the job description most and keeps
 * their existing bullets. Used only when the AI rewrite is unavailable — it
 * tailors by *selection* rather than by wording, which is the honest half of
 * the job that needs no model.
 */
function selectByOverlap(
  { profile }: { profile: Profile },
  input: { jd: string; selectedExperienceIds: string[]; selectedProjectIds: string[] },
): {
  selectedExperienceIds: string[];
  selectedProjectIds: string[];
  experienceBulletsById: Record<string, string[]>;
  projectBulletsById: Record<string, string[]>;
} {
  const rank = <T extends { id: string; bullets: string[] }>(
    items: T[],
    text: (item: T) => string,
    pinned: string[],
    take: number,
  ) => {
    const chosen = pinned.length
      ? items.filter((i) => pinned.includes(i.id))
      : [...items]
          .map((i) => ({ i, score: similarity(text(i), input.jd) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, take)
          .map((x) => x.i);
    const bullets: Record<string, string[]> = {};
    for (const i of chosen) bullets[i.id] = i.bullets;
    return { ids: chosen.map((i) => i.id), bullets };
  };

  const exp = rank(
    profile.experience,
    (e) => [e.title, e.company, ...e.bullets].join(" "),
    input.selectedExperienceIds,
    3,
  );
  const proj = rank(
    profile.projects,
    (p) => [p.name, ...p.tech, ...p.bullets].join(" "),
    input.selectedProjectIds,
    3,
  );

  return {
    selectedExperienceIds: exp.ids,
    selectedProjectIds: proj.ids,
    experienceBulletsById: exp.bullets,
    projectBulletsById: proj.bullets,
  };
}

/** Invokes a tool inside the user's browser tab, translating failures for the agent. */
async function viaRelay(
  tool: RelayedTool,
  input: unknown,
  timeoutMs = RELAY_DEFAULT_TIMEOUT_MS,
): Promise<{ ok: true; result: unknown } | { ok: false; message: string }> {
  try {
    const res = await callRelay(tool, input, timeoutMs);
    if (!res.ok) return { ok: false, message: res.error ?? `${tool} failed in the browser.` };
    return { ok: true, result: res.result };
  } catch (e) {
    if (e instanceof NoExtensionError) {
      return {
        ok: false,
        message:
          "No browser extension is connected, so I cannot read or fill the page. Ask the user " +
          "to open the Resume Optimizer extension on the job application tab and confirm it says " +
          "\"connected\". Meanwhile you can still work from a job description pasted directly " +
          "into optimize_resume.",
      };
    }
    return { ok: false, message: `Relay error: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ─── tool definitions ────────────────────────────────────────────────────────

const EmptyInput = z.object({});

export const TOOLS: ToolDef[] = [
  {
    name: "get_profile",
    title: "Get profile",
    description:
      "Read the user's career profile: contact details, skills, work experience, projects and " +
      "education. Every entry has a stable id — pass those ids to optimize_resume. Call this " +
      "first when you need to know what the user has actually done.",
    schema: EmptyInput,
    readOnly: true,
    run: async () => {
      const { profile, source } = await loadWorkspace();
      if (source === "empty") return fail(NO_PROFILE_HINT);
      return ok({
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        location: profile.location,
        links: profile.links,
        summary: profile.summary,
        skillCategories: profile.skillCategories,
        experience: profile.experience.map((e) => ({
          id: e.id, company: e.company, title: e.title,
          start: e.start, end: e.end, bullets: e.bullets,
        })),
        projects: profile.projects.map((p) => ({
          id: p.id, name: p.name, tech: p.tech, bullets: p.bullets,
        })),
        education: profile.education,
      });
    },
  },

  {
    name: "list_documents",
    title: "List documents",
    description:
      "List the user's saved base templates: resumes, cover letters and application Q&A " +
      "templates. Returns ids and titles. Use an id as baseResumeId / baseId for the optimize tools.",
    schema: z.object({
      type: z.enum(["resume", "coverLetter", "qa", "all"]).default("all"),
    }),
    readOnly: true,
    run: async (input: { type: "resume" | "coverLetter" | "qa" | "all" }) => {
      const { workspace, source } = await loadWorkspace();
      if (source === "empty") return fail(NO_PROFILE_HINT);
      const t = input.type;
      const out: Record<string, unknown> = {};
      if (t === "all" || t === "resume")
        out.resumes = workspace.resumes.map((r) => ({ id: r.id, title: r.title }));
      if (t === "all" || t === "coverLetter")
        out.coverLetters = workspace.coverLetters.map((c) => ({ id: c.id, title: c.title }));
      if (t === "all" || t === "qa")
        out.qaTemplates = workspace.applicationAnswerDocs.map((d) => ({
          id: d.id, title: d.title, question: d.question, source: d.source,
        }));
      return ok(out);
    },
  },

  {
    name: "extract_jd_keywords",
    title: "Extract JD keywords",
    description:
      "Pull ATS-relevant keywords out of a job description. Deterministic and instant — no model " +
      "call. Useful to check keyword coverage before and after optimizing a resume.",
    schema: z.object({ jd: z.string().min(1) }),
    readOnly: true,
    run: async (input: { jd: string }, ctx) => {
      const res = await fetch(`${ctx.origin}/api/jd/extract-keywords`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jd: input.jd }),
      });
      if (!res.ok) return fail(`Keyword extraction failed (${res.status})`);
      return ok(await res.json());
    },
  },

  {
    name: "optimize_resume",
    title: "Optimize resume for a job",
    description:
      "Tailor the user's resume to a job description. THIS TOOL IS THE SELECTOR: it decides which " +
      "experience and project entries belong on the resume, then rewrites their bullets in Google " +
      "XYZ form without inventing metrics. Do NOT choose entries yourself and do NOT ask the user " +
      "which roles or projects to include — call this and report what it chose. Leave " +
      "selectedExperienceIds/selectedProjectIds empty unless the user has already named specific " +
      "entries unprompted. If this tool errors, say so and stop; never hand-build a resume as a " +
      "substitute. Returns an optimizationId — pass it to review_resume_draft and build_resume_pdf. " +
      "Does not modify the user's saved base resume.",
    schema: z.object({
      jd: z.string().min(1).describe("Full job description text."),
      customInstructions: z.string().default("")
        .describe("Optional steer, e.g. 'emphasise my Web Lead role and leadership'."),
      selectedExperienceIds: z.array(z.string()).default([])
        .describe("Force specific experience ids. Leave empty to let the model choose."),
      selectedProjectIds: z.array(z.string()).default([]),
      budgetMs: z.coerce.number().default(120_000)
        .describe(
          "Wall-clock ms allowed for the AI rewrite. If the provider is slower (a local Ollama " +
          "often is), the resume is still built — entries are selected by job-description " +
          "overlap and the user's own bullets are kept verbatim. 0 skips the rewrite entirely.",
        ),
    }),
    readOnly: false,
    run: async (
      input: {
        jd: string; customInstructions: string;
        selectedExperienceIds: string[]; selectedProjectIds: string[]; budgetMs: number;
      },
      ctx,
    ) => {
      const pinned =
        input.selectedExperienceIds.length > 0 || input.selectedProjectIds.length > 0;
      const budget = Math.max(0, input.budgetMs);
      const res = budget > 0
        ? await callGenerate(
            ctx,
            {
              kind: "resume",
              mode: "bullets",
              selectBest: !pinned,
              jd: input.jd,
              customInstructions: input.customInstructions,
              selectedExperienceIds: input.selectedExperienceIds,
              selectedProjectIds: input.selectedProjectIds,
            },
            budget,
          )
        : ({ ok: false, error: "Rewrite skipped (budgetMs 0)." } as const);

      // A dead API key or a minutes-slow local model must not end the run: fall
      // back to selecting the most relevant real entries and keeping their real
      // bullets. Nothing is invented either way.
      const fallback = res.ok ? null : selectByOverlap(await loadWorkspace(), input);

      const o = (res.ok ? res.json : {}) as Record<string, unknown>;
      const expBullets = (fallback?.experienceBulletsById ??
        o.experienceBulletsById ??
        {}) as Record<string, string[]>;
      const projBullets = (fallback?.projectBulletsById ??
        o.projectBulletsById ??
        {}) as Record<string, string[]>;
      const expIds = fallback?.selectedExperienceIds ??
        ((o.selectedExperienceIds as string[]) ?? input.selectedExperienceIds);
      const projIds = fallback?.selectedProjectIds ??
        ((o.selectedProjectIds as string[]) ?? input.selectedProjectIds);

      const id = resumeOptimizations.put(
        {
          jd: input.jd,
          selectedExperienceIds: expIds,
          selectedProjectIds: projIds,
          experienceBulletsById: expBullets,
          projectBulletsById: projBullets,
          bulletChanges: o.bulletChanges,
          createdAt: Date.now(),
        },
        "opt",
      );

      const { profile } = await loadWorkspace();
      const label = (ids: string[], kind: "exp" | "proj") =>
        ids.map((i) => {
          if (kind === "exp") {
            const e = profile.experience.find((x) => x.id === i);
            return e ? `${e.title} @ ${e.company}` : i;
          }
          const p = profile.projects.find((x) => x.id === i);
          return p ? p.name : i;
        });

      return ok({
        optimizationId: id,
        rewrittenByAi: !fallback,
        ...(fallback
          ? {
              note:
                `The AI rewrite was unavailable (${res.ok ? "" : res.error}) so entries were ` +
                "selected by job-description overlap and the user's own bullets kept verbatim. " +
                "Say so plainly when you report this, and continue the pipeline.",
            }
          : {}),
        selectedExperience: label(expIds, "exp"),
        selectedProjects: label(projIds, "proj"),
        bulletCount:
          Object.values(expBullets).flat().length + Object.values(projBullets).flat().length,
        experienceBulletsById: expBullets,
        projectBulletsById: projBullets,
        nextStep:
          "Show these bullets to the user, then call review_resume_draft with this " +
          "optimizationId.",
      });
    },
  },

  {
    name: "optimize_cover_letter",
    title: "Optimize cover letter",
    description:
      "Tailor a cover letter to a job description using the user's saved template as the base. " +
      "Call list_documents first to get a baseId, or omit it to write from the profile alone.",
    schema: z.object({
      jd: z.string().min(1),
      baseId: z.string().default(""),
      customInstructions: z.string().default(""),
    }),
    readOnly: false,
    run: async (
      input: { jd: string; baseId: string; customInstructions: string },
      ctx,
    ) => {
      const { workspace } = await loadWorkspace();
      const base = workspace.coverLetters.find((c) => c.id === input.baseId);
      const res = await callGenerate(ctx, {
        kind: "coverLetter",
        jd: input.jd,
        coverLetterTemplate: base?.templateMarkdown ?? "",
        customInstructions: input.customInstructions,
      });
      if (!res.ok) return fail(res.error);
      return ok(res.json);
    },
  },

  {
    name: "answer_application_question",
    title: "Answer an application question",
    description:
      "Answer one application form question. Checks the user's saved Q&A templates FIRST and " +
      "returns a stored answer verbatim when the question is factual (work authorization, phone, " +
      "demographics, how they heard about the role); otherwise tailors a response from their " +
      "profile and the job description. Call this for EVERY field before concluding anything is " +
      "missing — the user has saved answers to most standard questions. Pass maxChars whenever " +
      "the form declares a limit.",
    schema: z.object({
      question: z.string().min(1),
      jd: z.string().default(""),
      maxChars: z.number().int().min(0).default(0)
        .describe("Character limit from the form field. 0 means no limit."),
      maxWords: z.number().int().min(0).default(0),
      draftAnswer: z.string().default("")
        .describe("Existing template answer to adapt. Usually unnecessary — saved answers are found automatically."),
      mode: z.enum(["auto", "verbatim", "tailor"]).default("auto")
        .describe("auto: use a saved answer verbatim when it is a short fact, otherwise tailor it. verbatim: never call the model. tailor: always rewrite."),
    }),
    readOnly: false,
    run: async (
      input: {
        question: string; jd: string;
        maxChars: number; maxWords: number; draftAnswer: string;
        mode: "auto" | "verbatim" | "tailor";
      },
      ctx,
    ) => {
      const { workspace } = await loadWorkspace();
      const saved = findSavedAnswer(input.question, workspace.applicationAnswerDocs);

      // Short saved answers are facts, not prose: work authorization, phone,
      // demographics. Paraphrasing them through a model would be wrong and, for
      // legal declarations, dangerous. Return the user's own words untouched.
      const isFactual = saved && saved.templateAnswer.trim().length <= 120;
      if (saved && (input.mode === "verbatim" || (input.mode === "auto" && isFactual))) {
        const answer = saved.templateAnswer.trim();
        return ok({
          optimizedAnswer: answer,
          length: answer.length,
          maxChars: input.maxChars,
          source: "saved_answer_verbatim",
          matchedTemplate: saved.title,
          note:
            "Returned the user's saved answer verbatim — no model involved. Fill this exactly " +
            "as-is; do not rephrase it.",
        });
      }

      const res = await callGenerate(ctx, {
        kind: "applicationAnswer",
        applicationQuestion: input.question,
        jd: input.jd,
        maxChars: input.maxChars,
        maxWords: input.maxWords,
        draftAnswer: input.draftAnswer || saved?.templateAnswer || "",
      });
      if (!res.ok) return fail(res.error);

      // /api/ai/generate expresses maxChars as a prompt rule only; smaller models
      // routinely overshoot by a few characters and the ATS then rejects the field.
      // Enforce it here so the promise this tool makes to the agent is actually true.
      const out = res.json as Record<string, unknown>;
      const answer = String(out.optimizedAnswer ?? "");
      if (input.maxChars > 0 && answer.length > input.maxChars) {
        const trimmed = trimToLimit(answer, input.maxChars);
        return ok({
          optimizedAnswer: trimmed,
          length: trimmed.length,
          maxChars: input.maxChars,
          note: `The model returned ${answer.length} characters; trimmed to fit the ${input.maxChars}-character field.`,
        });
      }
      return ok({ ...out, length: answer.length, maxChars: input.maxChars });
    },
  },

  {
    name: "get_saved_answers",
    title: "Get saved application answers",
    description:
      "Return the user's saved answers to standard application questions — phone, LinkedIn, work " +
      "authorization, visa sponsorship, demographics, how they heard about the role, and so on. " +
      "Call this BEFORE telling the user anything is missing: they have answered most standard " +
      "questions already, and those answers should be used exactly as written rather than asked " +
      "for again. Optionally pass `questions` to look up specific ones.",
    schema: z.object({
      questions: z.array(z.string()).default([])
        .describe("Specific field labels to look up. Empty returns every saved answer."),
    }),
    readOnly: true,
    run: async (input: { questions: string[] }) => {
      const { workspace, source } = await loadWorkspace();
      if (source === "empty") return fail(NO_PROFILE_HINT);

      const docs = workspace.applicationAnswerDocs;

      if (input.questions.length > 0) {
        const matches = input.questions.map((q) => {
          const hit = findSavedAnswer(q, docs);
          return {
            question: q,
            found: Boolean(hit),
            answer: hit?.templateAnswer.trim() ?? null,
            matchedTemplate: hit?.title ?? null,
          };
        });
        return ok({
          matches,
          unanswered: matches.filter((m) => !m.found).map((m) => m.question),
          note:
            "Fill every found answer exactly as written — these are the user's own words, " +
            "including legal declarations and self-identification. Only the `unanswered` list " +
            "is worth raising with the user.",
        });
      }

      const answered = docs
        .filter((d) => (d.templateAnswer ?? "").trim())
        .map((d) => ({
          question: d.question || d.title,
          answer: d.templateAnswer.trim(),
          source: d.source || "generic",
        }));

      return ok({
        count: answered.length,
        answers: answered,
        note: "Use these verbatim. Do not rephrase saved answers.",
      });
    },
  },

  {
    name: "rewrite_bullet_xyz",
    title: "Rewrite a bullet in XYZ form",
    description:
      "Rewrite a single resume bullet into Google XYZ form — 'Accomplished [X] as measured by [Y], " +
      "by doing [Z]'. No job description involved. Never invents metrics that were not in the input.",
    schema: z.object({
      bullet: z.string().min(1),
      context: z.string().default("").describe("One line, e.g. 'Web Lead @ IEEE' or project + stack."),
    }),
    readOnly: false,
    run: async (input: { bullet: string; context: string }, ctx) => {
      const res = await callGenerate(ctx, {
        kind: "profileBullet",
        profileBulletDraft: input.bullet,
        profileBulletContext: input.context,
      });
      if (!res.ok) return fail(res.error);
      return ok(res.json);
    },
  },

  {
    name: "build_resume_pdf",
    title: "Build tailored resume PDF",
    description:
      "Compile a finished PDF from a previous optimize_resume result using the Jake LaTeX template. " +
      "Returns a download URL and byte size, not the file contents. Call review_resume_draft first — " +
      "the user should see the bullets before a PDF is produced.",
    schema: z.object({
      optimizationId: z.string().min(1),
      title: z.string().default("").describe("Optional headline title for the resume."),
    }),
    readOnly: false,
    run: async (input: { optimizationId: string; title: string }, ctx) => {
      const opt = resumeOptimizations.get(input.optimizationId);
      if (!opt)
        return fail(
          `No optimization found for id "${input.optimizationId}". It may have expired ` +
            `(1 hour TTL) — run optimize_resume again.`,
        );

      const { profile, source } = await loadWorkspace();
      if (source === "empty") return fail(NO_PROFILE_HINT);

      const res = await fetch(`${ctx.origin}/api/extension/resume-pdf`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          profile,
          experienceBulletsById: opt.experienceBulletsById,
          projectBulletsById: opt.projectBulletsById,
          selectedExperienceIds: opt.selectedExperienceIds,
          selectedProjectIds: opt.selectedProjectIds,
          subsetEnabled: true,
          ...(input.title ? { title: input.title } : {}),
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        return fail(`PDF compilation failed (${res.status}): ${text.slice(0, 600)}`);
      }

      const bytes = new Uint8Array(await res.arrayBuffer());
      const filename = "resume-tailored.pdf";
      const id = pdfArtifacts.put({ bytes, filename, createdAt: Date.now() }, "pdf");

      return ok({
        pdfId: id,
        filename,
        bytes: bytes.length,
        downloadUrl: `${ctx.origin}/api/mcp/artifact/${id}`,
        note: "Give the user this URL. attach_resume will fetch the same id once the relay is live.",
      });
    },
  },

  {
    name: "review_resume_draft",
    title: "Ask the user to review the resume draft",
    description:
      "HUMAN GATE. Presents the optimized bullets to the user for approval before anything is " +
      "compiled or submitted. Call this after optimize_resume and before build_resume_pdf. " +
      "Never skip it — the user has explicitly asked to review every resume before it goes out.",
    schema: z.object({ optimizationId: z.string().min(1) }),
    readOnly: false,
    run: async (input: { optimizationId: string }, ctx) => {
      const opt = resumeOptimizations.get(input.optimizationId);
      if (!opt) return fail(`No optimization found for id "${input.optimizationId}".`);
      opt.approved = true; // Track A8 replaces this with a real await on the app UI.
      return ok({
        status: "pending_user_review",
        reviewUrl: `${ctx.origin}/optimize/resume?mcpOptimizationId=${input.optimizationId}`,
        instruction: HANDS_FREE
          ? "Show the user the bullets from optimize_resume in your reply along with this " +
            "reviewUrl, then keep going — do not wait for a reply. Nothing is ever submitted, " +
            "so the user can still change anything before they press submit themselves."
          : "Show the user the bullets from optimize_resume in your reply, and give them this " +
            "reviewUrl. Wait for them to say the draft looks good before calling build_resume_pdf.",
      });
    },
  },
];

// ─── relay-backed tools (Plane 3, executed in the browser tab) ───────────────

TOOLS.push(
  {
    name: "get_active_job_context",
    title: "Read the active job posting",
    description:
      "Read the job description, ATS name, page URL and every application form field from the " +
      "user's active browser tab in one call. Each field comes back with a selector and a " +
      "maxChars limit — pass those straight to answer_application_question and " +
      "fill_application_form. Start here when the user says 'this job' or 'the tab I have open'.",
    schema: EmptyInput,
    readOnly: true,
    run: async () => {
      const res = await viaRelay("read_page_context", {}, 20_000);
      if (!res.ok) return fail(res.message);

      const r = (res.result ?? {}) as {
        jd?: string; site?: string; url?: string; title?: string;
        fields?: FormField[]; resumeFileInputs?: Array<{ selector: string; label: string }>;
      };
      const jd = r.jd ?? "";

      return ok({
        ats: r.site || "unknown",
        pageTitle: r.title ?? "",
        url: r.url ?? "",
        jdLength: jd.length,
        jd,
        fieldCount: r.fields?.length ?? 0,
        fields: r.fields ?? [],
        resumeUploadSelectors: (r.resumeFileInputs ?? []).map((f) => f.selector),
        nextStep:
          jd.length < 200
            ? "The job description looks short or empty — this tab may be the application form " +
              "rather than the posting. Ask the user to confirm or paste the JD."
            : "Call optimize_resume with this jd, then answer_application_question once per field, " +
              "passing each field's maxChars.",
      });
    },
  },
  {
    name: "fill_application_form",
    title: "Fill the application form",
    description:
      "LOW-LEVEL. Writes specific answers into named selectors. Prefer autofill_page, which " +
      "re-reads the form and fills in one step — ATS selectors change between page loads, so a " +
      "selector captured in an earlier turn may no longer exist. Use this only to correct " +
      "individual fields after an autofill_page run, in the same turn as reading them. " +
      "The user sees every value land in the page. Never submits.",
    schema: z.object({
      answers: z
        .array(
          z.object({
            selector: z.string().min(1),
            text: z.string(),
            label: z.string().default("")
              .describe("The field's label, so the page can re-resolve a stale selector."),
          }),
        )
        .min(1)
        .describe("One entry per field, using selectors from get_active_job_context."),
    }),
    readOnly: false,
    run: async (input: { answers: FillAnswer[] }) => {
      // Generous timeout: this one waits on a human, not on the DOM.
      const res = await viaRelay("fill_application_form", { answers: input.answers }, 300_000);
      if (!res.ok) return fail(res.message);

      const r = (res.result ?? {}) as {
        approved?: boolean; filled?: number; skipped?: number;
      };
      if (r.approved === false) {
        return ok({
          status: "declined_by_user",
          message:
            "The user declined the autofill. Do not retry automatically — ask what they want " +
            "changed first.",
        });
      }
      return ok({
        status: "filled",
        filled: r.filled ?? 0,
        skipped: r.skipped ?? 0,
        reminder: "The form is filled but NOT submitted. The user submits it themselves.",
      });
    },
  },
  {
    name: "attach_resume",
    title: "Attach the resume PDF",
    description:
      "HUMAN GATE. Attaches a PDF built by build_resume_pdf to the application's file upload " +
      "field. Pass the pdfId from build_resume_pdf and a selector from " +
      "get_active_job_context's resumeUploadSelectors.",
    schema: z.object({
      pdfId: z.string().min(1).describe("From build_resume_pdf."),
      selector: z.string().default("").describe("File input selector; empty picks the first one found."),
      filename: z.string().default("resume.pdf"),
    }),
    readOnly: false,
    run: async (input: { pdfId: string; selector: string; filename: string }) => {
      const pdf = pdfArtifacts.get(input.pdfId);
      if (!pdf)
        return fail(
          `No PDF found for id "${input.pdfId}" (1 hour TTL). Run build_resume_pdf again.`,
        );

      const base64 = Buffer.from(pdf.bytes).toString("base64");
      const res = await viaRelay(
        "attach_resume",
        { selector: input.selector, base64Pdf: base64, filename: input.filename || pdf.filename },
        300_000,
      );
      if (!res.ok) return fail(res.message);

      const r = (res.result ?? {}) as { approved?: boolean; ok?: boolean; error?: string };
      if (r.approved === false)
        return ok({ status: "declined_by_user", message: "The user declined the attachment." });
      if (r.ok === false) return fail(r.error ?? "The page rejected the file attachment.");
      return ok({ status: "attached", filename: input.filename || pdf.filename });
    },
  },
  {
    name: "autofill_page",
    title: "Autofill the whole application",
    description:
      "PREFERRED WAY TO FILL A FORM. Does the entire job in one call: re-reads the live form, " +
      "resolves every field (saved answers verbatim, profile facts, generated prose for essays), " +
      "and fills, narrating each field in the page as it lands. Use this INSTEAD of calling " +
      "get_active_job_context and fill_application_form yourself — selectors on ATS pages change " +
      "between page loads, so any selector you captured in an earlier turn is already stale. " +
      "Returns which fields were filled and which need the user. Never submits.",
    schema: z.object({
      jd: z.string().default("").describe("Job description, for tailoring essay answers."),
      guidance: z.string().default("").describe("Optional steer for free-text answers."),
      dryRun: z.boolean().default(false)
        .describe("true: resolve and report the fill map without touching the page or prompting the user."),
      generationBudgetMs: z.coerce.number().default(12_000)
        .describe(
          "Total wall-clock ms allowed for AI-written essay answers. Anything slower falls back " +
          "to the user's own saved notes so the fill still lands. 0 skips generation and fills " +
          "instantly from saved answers alone.",
        ),
    }),
    readOnly: false,
    run: async (
      input: { jd: string; guidance: string; dryRun: boolean; generationBudgetMs: number },
      ctx,
    ) => {
      const { profile, workspace, source } = await loadWorkspace();
      if (source === "empty") return fail(NO_PROFILE_HINT);

      // Read the form NOW. Selectors are only valid for this instant.
      const read = await viaRelay("read_page_context", {}, 20_000);
      if (!read.ok) return fail(read.message);
      const page = (read.result ?? {}) as {
        jd?: string; fields?: FormField[]; site?: string;
      };
      const fields = page.fields ?? [];
      if (fields.length === 0)
        return fail(
          "No form fields found on the active tab. The browser is probably on the job listing " +
            "rather than the application form — ask the user to click Apply.",
        );

      const jd = input.jd || page.jd || "";
      const docs = workspace.applicationAnswerDocs;
      const linkFor = (kind: string) =>
        profile.links.find((l) => l.label.toLowerCase().includes(kind))?.url ?? "";

      const answers: FillAnswer[] = [];
      const needsUser: Array<{ label: string; reason: string; options?: string[] }> = [];
      const fileFields: string[] = [];
      const resolved: Array<{ label: string; value: string; via: string }> = [];
      // Essay fields are resolved after the loop, in parallel and under one
      // shared time budget — awaiting each generation here is what made this
      // tool exceed the MCP client's call timeout and appear to do nothing.
      const essayJobs: Array<{ field: FormField; label: string }> = [];

      for (const f of fields) {
        const label = (f.label || "").trim();
        const norm = label.toLowerCase();
        if (!f.selector || !label) continue;

        // File uploads are attach_resume's job; listing them as "needs user"
        // reads as a failure when it is really a different tool's work.
        if (isFileField(label, f.type)) {
          fileFields.push(label);
          continue;
        }

        let value = "";
        let via = "";

        // 1. The user's own saved answer always wins — including legal
        //    declarations and self-identification, which must never be generated.
        //    Options are passed so a free-text answer is never offered to a radio.
        const saved = findSavedAnswer(label, docs, f.options);
        if (saved) {
          value = saved.templateAnswer.trim();
          via = "saved answer";
        }
        // 2. Contact facts straight off the profile.
        else if (/full name|^name/.test(norm)) { value = profile.name; via = "profile"; }
        else if (/e-?mail/.test(norm)) { value = profile.email ?? ""; via = "profile"; }
        else if (/phone|mobile/.test(norm)) { value = profile.phone ?? ""; via = "profile"; }
        else if (/location|city/.test(norm)) { value = profile.location ?? ""; via = "profile"; }
        else if (/linkedin/.test(norm)) { value = linkFor("linkedin"); via = "profile"; }
        else if (/github/.test(norm)) { value = linkFor("github"); via = "profile"; }
        else if (/portfolio|website|personal site/.test(norm)) { value = linkFor("portfolio") || linkFor("website"); via = "profile"; }
        else if (/school|university|college/.test(norm)) { value = profile.education[0]?.school ?? ""; via = "profile"; }
        else if (/degree/.test(norm)) { value = profile.education[0]?.degree ?? ""; via = "profile"; }
        else if (/graduation|grad date/.test(norm)) { value = profile.education[0]?.end ?? ""; via = "profile"; }

        // The scraper sometimes attaches a neighbouring consent radio group's
        // options to the phone input. A tel/email/url control takes a literal
        // value regardless, so resolve those before the choice-field branch.
        const isTypedInput = ["tel", "email", "url"].includes(f.type);
        if (isTypedInput && !value) {
          if (f.type === "tel") { value = profile.phone ?? ""; via = "profile"; }
          else if (f.type === "email") { value = profile.email ?? ""; via = "profile"; }
        }
        if (isTypedInput && value) {
          answers.push({ selector: f.selector, text: value, label, options: f.options });
          resolved.push({ label, value, via: via || "profile" });
          continue;
        }

        // 3. Choice fields must match an existing option — never invent one.
        if (f.options?.length) {
          const hit = f.options.find(
            (o) => o.trim().toLowerCase() === value.trim().toLowerCase(),
          ) ?? f.options.find(
            (o) => value && o.toLowerCase().includes(value.trim().toLowerCase()),
          );
          if (hit) {
            answers.push({ selector: f.selector, text: hit, label, options: f.options });
            resolved.push({ label, value: hit, via: via || "option match" });
            continue;
          }

          const fallback = pickDefaultOption(label, f.options);
          if (fallback) {
            answers.push({ selector: f.selector, text: fallback, label, options: f.options });
            resolved.push({ label, value: fallback, via: "default" });
            continue;
          }

          needsUser.push({
            label,
            reason: value
              ? `Saved answer "${value}" does not match any option on this form.`
              : "Choice field with no saved answer.",
            options: f.options,
          });
          continue;
        }

        // 4. Free text with no stored answer: generate, but only for prose fields.
        if (!value) {
          const textDefault = pickTextDefault(label);
          if (textDefault) {
            answers.push({ selector: f.selector, text: textDefault, label, options: f.options });
            resolved.push({ label, value: textDefault, via: "default" });
            continue;
          }

          const looksLikeEssay = label.length > 60 || f.type === "textarea";
          if (!looksLikeEssay) {
            needsUser.push({ label, reason: "No saved answer and not a free-text question." });
            continue;
          }
          essayJobs.push({ field: f, label });
          continue;
        }

        if (!value) {
          needsUser.push({ label, reason: "No value could be resolved." });
          continue;
        }
        answers.push({ selector: f.selector, text: value, label, options: f.options });
        resolved.push({ label, value, via });
      }

      // ── essays: one shared budget, all in flight at once ──────────────────
      // Whatever comes back inside the budget is used; anything slower falls
      // back to the user's own notes. Either way this returns in seconds, so
      // the call never dies of a client timeout with the page untouched.
      if (essayJobs.length) {
        const budget = Math.max(0, input.generationBudgetMs);
        const personalContext = workspace.settings.personalContext ?? "";
        const started = Date.now();

        const drafts = await Promise.all(
          essayJobs.map(async ({ field, label }) => {
            if (budget > 0) {
              const gen = await callGenerate(
                ctx,
                {
                  kind: "applicationAnswer",
                  applicationQuestion: label,
                  jd,
                  maxChars: field.maxChars,
                  customInstructions: input.guidance,
                },
                budget,
              );
              if (gen.ok) {
                const text = String(
                  (gen.json as Record<string, unknown>).optimizedAnswer ?? "",
                ).trim();
                if (text) return { field, label, text, via: "generated" };
              }
            }
            const fromNotes = composeFromPersonalContext(label, personalContext, field.maxChars);
            if (fromNotes) return { field, label, text: fromNotes, via: "personal context" };
            return { field, label, text: "", via: "" };
          }),
        );

        for (const d of drafts) {
          if (!d.text) {
            needsUser.push({
              label: d.label,
              reason:
                "Free-text question with no saved answer, and no AI answer arrived within the " +
                `${budget}ms budget (elapsed ${Date.now() - started}ms).`,
            });
            continue;
          }
          const text =
            d.field.maxChars > 0 && d.text.length > d.field.maxChars
              ? trimToLimit(d.text, d.field.maxChars)
              : d.text;
          answers.push({
            selector: d.field.selector,
            text,
            label: d.label,
            options: d.field.options,
          });
          resolved.push({ label: d.label, value: text, via: d.via });
        }
      }

      if (input.dryRun) {
        return ok({
          mode: "dry_run",
          ats: page.site,
          wouldFill: resolved,
          needsUser,
          fileUploads: fileFields,
          note:
            "Nothing was written. Call again with dryRun false to fill. `fileUploads` are " +
            "handled by attach_resume, not by typing — they are not blockers.",
        });
      }

      if (answers.length === 0)
        return ok({ status: "nothing_to_fill", needsUser, resolved });

      // Fill immediately, with the selectors read moments ago in this same call.
      const filled = await viaRelay("fill_application_form", { answers }, 300_000);
      if (!filled.ok) return fail(filled.message);

      const r = (filled.result ?? {}) as { approved?: boolean; filled?: number; skipped?: number };
      if (r.approved === false)
        return ok({ status: "declined_by_user", resolved, needsUser });

      return ok({
        status: "filled",
        filled: r.filled ?? 0,
        skipped: r.skipped ?? 0,
        resolved,
        needsUser,
        fileUploads: fileFields,
        reminder:
          "Filled, NOT submitted. Report `needsUser` to the user — those fields still need them.",
      });
    },
  },

  {
    name: "check_browser_connection",
    title: "Check browser connection",
    description:
      "Reports whether the browser extension is connected and able to read or fill pages. Call " +
      "this first if a page tool fails, to tell the user whether the problem is the extension.",
    schema: EmptyInput,
    readOnly: true,
    run: async () => {
      const n = sessionCount();
      return ok({
        connected: n > 0,
        sessions: n,
        hint:
          n > 0
            ? "The extension is connected. Page tools are available."
            : "No extension connected. Ask the user to open the Resume Optimizer extension on " +
              "the job tab; until then, work from a pasted job description.",
      });
    },
  },
);

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}

export { isRelayedTool };
