import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";

import { computeResumeBulletChanges } from "../../../lib/resume-bullet-diff";
import {
  formatOllamaConnectionError,
  getOllamaConfig,
} from "@/app/lib/ollama-config";
import type { Profile } from "@/app/lib/profile-model";

export const runtime = "nodejs";
export const maxDuration = 300;

const GenerateRequestSchema = z.object({
  kind: z.enum([
    "resume",
    "coverLetter",
    "applicationAnswer",
    "profileBullet",
  ]),
  mode: z.enum(["select", "bullets"]).optional().default("select"),
  /** When true with mode=bullets: AI picks best 4 exp + 2 proj AND rewrites bullets in one call. */
  selectBest: z.boolean().optional().default(false),
  template: z.string().optional(),
  jd: z.string().optional().default(""),
  coverLetterTemplate: z.string().optional().default(""),
  selectedExperienceIds: z.array(z.string()).optional().default([]),
  selectedProjectIds: z.array(z.string()).optional().default([]),
  skillsMd: z.string().optional().default(""),
  /** Free-form "about me" context: interests, values, goals, project narratives. */
  personalContext: z.string().optional().default(""),
  applicationQuestion: z.string().optional().default(""),
  draftAnswer: z.string().optional().default(""),
  /** Free-text user guidance, e.g. "use my Web Lead role and focus on leadership". */
  customInstructions: z.string().optional().default(""),
  /** Field length limits detected from the form (0 = none). */
  maxChars: z.number().optional().default(0),
  maxWords: z.number().optional().default(0),
  /** Single bullet to rewrite (Profile page; no JD). */
  profileBulletDraft: z.string().optional().default(""),
  /** Short line of context, e.g. role @ company or project name + tech. */
  profileBulletContext: z.string().optional().default(""),
  profile: z
    .object({
      name: z.string().default(""),
      email: z.string().optional().default(""),
      phone: z.string().optional().default(""),
      location: z.string().optional().default(""),
      links: z.array(z.object({ label: z.string(), url: z.string() })).default([]),
      summary: z.string().optional().default(""),
      skills: z.array(z.string()).default([]),
      skillCategories: z
        .array(
          z.object({
            id: z.string(),
            label: z.string().default(""),
            items: z.array(z.string()).default([]),
          }),
        )
        .optional()
        .default([]),
      experience: z
        .array(
          z.object({
            id: z.string(),
            company: z.string(),
            title: z.string(),
            location: z.string().optional().default(""),
            start: z.string().optional().default(""),
            end: z.string().optional().default(""),
            bullets: z.array(z.string()).default([]),
          })
        )
        .default([]),
      projects: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            link: z.string().optional().default(""),
            tech: z.array(z.string()).default([]),
            bullets: z.array(z.string()).default([]),
          })
        )
        .default([]),
      education: z
        .array(
          z.object({
            id: z.string(),
            school: z.string(),
            degree: z.string().optional().default(""),
            location: z.string().optional().default(""),
            start: z.string().optional().default(""),
            end: z.string().optional().default(""),
            details: z.array(z.string()).default([]),
          })
        )
        .default([]),
    })
    .loose(),
});

type GenerateInput = z.infer<typeof GenerateRequestSchema>;

function getApiKey(req: Request) {
  const headerKey = req.headers.get("x-gemini-api-key")?.trim();
  if (headerKey) return headerKey;
  const envKey = process.env.GEMINI_API_KEY?.trim();
  if (envKey) return envKey;
  return "";
}

function getGroqApiKey(req: Request) {
  const headerKey = req.headers.get("x-groq-api-key")?.trim();
  if (headerKey) return headerKey;
  const envKey = process.env.GROQ_API_KEY?.trim();
  if (envKey) return envKey;
  return "";
}

const GROQ_MODEL_CANDIDATES = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  // Older Llama/Qwen names Groq has since retired for some accounts — kept as
  // harmless fallbacks in case a given key still has access to them.
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "qwen/qwen3-32b",
];

/** Groq's API is OpenAI-compatible; try a few current models since exact names shift over time. */
async function groqCompleteJson(prompt: string, apiKey: string): Promise<string> {
  const errors: string[] = [];
  for (const model of GROQ_MODEL_CANDIDATES) {
    let res: Response;
    try {
      res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(120_000),
      });
    } catch (e) {
      errors.push(`${model}: ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    const raw = await res.text();
    if (!res.ok) {
      errors.push(`${model} (${res.status}): ${raw.slice(0, 300)}`);
      continue;
    }
    try {
      const data = JSON.parse(raw) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (text) return text;
      errors.push(`${model}: empty response`);
    } catch {
      errors.push(`${model}: unparsable response`);
    }
  }
  throw new Error(
    ["Groq request failed for all configured models.", "", "Tried:", ...errors.map((e) => `- ${e}`)].join("\n"),
  );
}

/** Qwen / reasoning models often emit a think block before JSON. */
function stripThinkingAndNoise(raw: string): string {
  let s = raw.trim();
  const T0 = String.fromCharCode(60);
  const Tc = String.fromCharCode(60, 47);
  const think = T0 + "think" + String.fromCharCode(62);
  const thinkEnd = Tc + "think" + String.fromCharCode(62);
  const Think = T0 + "Think" + String.fromCharCode(62);
  const ThinkEnd = Tc + "Think" + String.fromCharCode(62);
  const rr = T0 + "reasoning" + String.fromCharCode(62);
  const rrEnd = Tc + "reasoning" + String.fromCharCode(62);
  s = s.replace(new RegExp(think + "[\\s\\S]*?" + thinkEnd, "gi"), "");
  s = s.replace(new RegExp(Think + "[\\s\\S]*?" + ThinkEnd, "gi"), "");
  s = s.replace(new RegExp(rr + "[\\s\\S]*?" + rrEnd, "gi"), "");
  s = s.replace(/<thinking>[\s\S]*?<\/thinking>/gi, "");
  s = s.replace(new RegExp(think + "[\\s\\S]*$", "i"), "");
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/m;
  const m = s.match(fence);
  if (m?.[1]) s = m[1].trim();
  return s.trim();
}

const OLLAMA_OPTIONS = {
  // Full context — a smaller window truncated large profiles + the prompt and
  // broke JSON output. Keep this generous for reliability.
  num_ctx: 16384,
  temperature: 0.2,
};

// Keep the model resident between calls to avoid a multi-second reload each
// time. This only affects load latency, never the generated output.
const OLLAMA_KEEP_ALIVE = "10m";

async function ollamaChatOnce(
  baseUrl: string,
  model: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; text: string }> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(240_000),
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      text: formatOllamaConnectionError(baseUrl, model, e),
    };
  }
  const raw = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, text: raw || res.statusText };
  }
  try {
    const data = JSON.parse(raw) as {
      message?: { content?: string; thinking?: string };
    };
    const msg = data.message;
    let content = msg?.content?.trim() ?? "";
    const thinking = msg?.thinking?.trim() ?? "";
    if (!content && thinking) {
      content = thinking;
    } else if (content && thinking && !content.includes("{") && thinking.includes("{")) {
      content = thinking;
    }
    return { ok: true, status: res.status, text: content };
  } catch {
    return { ok: false, status: res.status, text: raw };
  }
}

async function ollamaGenerateOnce(
  baseUrl: string,
  model: string,
  body: Record<string, unknown>
): Promise<{ ok: boolean; status: number; text: string }> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(240_000),
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      text: formatOllamaConnectionError(baseUrl, model, e),
    };
  }
  const raw = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, text: raw || res.statusText };
  }
  try {
    const data = JSON.parse(raw) as { response?: string };
    const content = data.response?.trim() ?? "";
    return { ok: true, status: res.status, text: content };
  } catch {
    return { ok: false, status: res.status, text: raw };
  }
}

/**
 * Qwen and similar models: use JSON mode, strip reasoning prefixes, fall back
 * to /api/generate if /api/chat returns empty (some Ollama builds differ).
 */
async function ollamaCompleteJson(
  prompt: string,
  baseUrl: string,
  model: string
): Promise<string> {
  const chatBase = {
    model,
    messages: [{ role: "user", content: prompt }],
    stream: false,
    keep_alive: OLLAMA_KEEP_ALIVE,
    options: OLLAMA_OPTIONS,
  };

  let r = await ollamaChatOnce(baseUrl, model, { ...chatBase, format: "json" });
  if (!r.ok && r.status === 400) {
    r = await ollamaChatOnce(baseUrl, model, chatBase);
  }
  if (!r.ok) {
    throw new Error(
      r.status === 0
        ? r.text
        : `Ollama /api/chat (${r.status}): ${r.text.slice(0, 800)}`,
    );
  }

  let text = stripThinkingAndNoise(r.text);
  if (!text) {
    const genBase = {
      model,
      prompt,
      stream: false,
      keep_alive: OLLAMA_KEEP_ALIVE,
      options: OLLAMA_OPTIONS,
    };
    let g = await ollamaGenerateOnce(baseUrl, model, {
      ...genBase,
      format: "json",
    });
    if (!g.ok && g.status === 400) {
      g = await ollamaGenerateOnce(baseUrl, model, genBase);
    }
    if (!g.ok) {
      throw new Error(
        g.status === 0
          ? g.text
          : `Ollama /api/generate (${g.status}): ${g.text.slice(0, 800)}`,
      );
    }
    text = stripThinkingAndNoise(g.text);
  }

  if (!text) {
    throw new Error(
      [
        "Ollama returned empty output for this model.",
        "",
        "Try:",
        "- Exact name from `ollama list` (e.g. qwen2.5:latest, not just qwen).",
        "- `ollama pull qwen2.5` (or your variant).",
        "- Base URL `http://127.0.0.1:11434` if localhost fails.",
      ].join("\n")
    );
  }

  return text;
}

function buildPrompt(input: GenerateInput): string {
  if (input.kind === "applicationAnswer") {
    return buildApplicationAnswerPrompt(input);
  }
  if (input.kind === "profileBullet") {
    return buildProfileBulletPrompt(input);
  }
  if (input.kind === "resume") {
    return buildResumePrompt(input);
  }
  return buildCoverLetterPrompt(input);
}

function buildProfileBulletPrompt(input: GenerateInput) {
  const draft = (input.profileBulletDraft ?? "").trim();
  const ctx = (input.profileBulletContext ?? "").trim();
  const skillsMd = input.skillsMd ?? "";
  return [
    "You are an expert resume editor trained on Google-style resume guidance.",
    "Goal: rewrite ONE resume bullet using the XYZ formula when it fits the facts:",
    '  "Accomplished [X] as measured by [Y], by doing [Z]"',
    "- X: the strongest outcome or scope (what changed).",
    "- Y: quantified or concrete evidence (metric, scale, baseline→result, adoption, latency). Use numbers ONLY if they are clearly implied or stated in the draft or profile—never invent metrics.",
    "- Z: how you did it (actions, tools, methods, collaboration).",
    "If a truthful numeric Y is not available, use a concrete non-numeric Y (e.g. role of system, user group, production scope) or a tight single-line bullet that still leads with impact—do not fabricate percentages or dollar amounts.",
    "",
    "Hard rules:",
    "- Output exactly ONE bullet line. No markdown, no quotes wrapping the whole line, no leading bullet character.",
    "- Past tense, strong verb, concise (aim for one line).",
    "- Do not add employers, titles, dates, or degrees not already supported by the draft/profile.",
    "- Return ONLY valid JSON. No markdown fences. No backticks.",
    "",
    "Return JSON schema:",
    "{",
    '  "optimizedBullet": string',
    "}",
    "",
    "Context for this bullet (role, company, project, dates—may be empty):",
    ctx || "(none)",
    "",
    "Current bullet draft:",
    draft,
    "",
    "Full profile JSON (for factual grounding only):",
    JSON.stringify(input.profile, null, 2),
    "",
    "skills.md (optional):",
    skillsMd,
    "",
    "Now produce the JSON result.",
  ].join("\n");
}

function buildApplicationAnswerPrompt(input: GenerateInput) {
  const q = (input.applicationQuestion ?? "").trim();
  const draft = (input.draftAnswer ?? "").trim();
  const personalContext = (input.personalContext ?? "").trim();
  const jd = (input.jd ?? "").trim();
  const skillsMd = input.skillsMd ?? "";
  const instructions = (input.customInstructions ?? "").trim();
  const hasJd = Boolean(jd);
  const maxChars = input.maxChars ?? 0;
  const maxWords = input.maxWords ?? 0;

  // Build the length instruction. Aim slightly under the hard cap for safety.
  let lengthRule: string | null = null;
  if (maxChars > 0) {
    const target = Math.max(40, Math.floor(maxChars * 0.9));
    lengthRule = `- LENGTH LIMIT (hard): the answer MUST be at most ${maxChars} characters including spaces — the form rejects anything longer. Aim for about ${target} characters. Be concise; do not pad.`;
  } else if (maxWords > 0) {
    const target = Math.max(15, Math.floor(maxWords * 0.9));
    lengthRule = `- LENGTH LIMIT (hard): the answer MUST be at most ${maxWords} words — aim for about ${target} words. Be concise; do not pad.`;
  }

  const lines: Array<string | null> = [
    "You are helping a candidate write a thoughtful, genuine, first-person answer to an application essay question. Write the way a sharp, reflective person actually speaks — natural and specific, NOT like a resume.",
    "",
    "STEP 1 — Work out what the question is REALLY asking, and answer THAT. Do not default to recapping a past project. Common types:",
    "  (a) Experience / behavioral — 'tell us about a time…', 'a project you're proud of', 'a challenge you faced', 'describe something you built'. → Tell ONE real story from the candidate's background.",
    "  (b) Forward-looking / motivation — 'what problems do you want to solve?', 'why this program/company?', 'what do you hope to gain?', 'where do you see yourself'. → This is about the candidate's genuine INTERESTS, VALUES, and VISION for the future. Do NOT force in a past project. Reference background only briefly, and only if it adds credibility.",
    "  (c) Idea / creative — 'what would you build?', 'pitch a project', 'what excites you'. → Propose a specific, genuine, creative IDEA: the problem it solves and why it's interesting. Focus on the idea, not past accomplishments. A light nod to relevant skills is fine; do NOT turn it into a resume recap.",
    "",
    "STEP 2 — Answer EVERY part of a multi-part question. E.g. 'what problems? how would attending help? what else do you want?' must address all three.",
    "",
    "For EXPERIENCE questions: go beyond the resume — give the WHY (the real problem/motivation), the key DECISIONS and TRADEOFFS and reasoning, what was genuinely HARD, and a specific honest LESSON. Lead with the problem in plain language, not a job title or metric. Show what was chosen AND deliberately not chosen, and why.",
    "",
    "For FORWARD-LOOKING and IDEA questions: lead with the candidate's actual interests and ideas. Be concrete about the kinds of problems, systems, or domains that excite them. Only weave in background if the question explicitly asks how their experience prepares them. It is completely fine — expected, even — for these answers to NOT mention any specific past project.",
    "",
    "Universal: be specific and personal, never generic brochure filler ('I am passionate about leveraging technology to make an impact'). Sound like a real person with real opinions.",
  ];

  if (instructions) {
    lines.push(
      "",
      "USER INSTRUCTIONS (HIGHEST PRIORITY — follow these closely; they may tell you which experience/angle to use or what to emphasize):",
      instructions,
    );
  }

  lines.push(
    "",
    "Hard rules:",
    lengthRule,
    "- Do NOT restate, paraphrase, or stitch together the profile's resume bullet points. For experience answers, use them only as raw facts to build a story; for forward-looking/idea answers, you usually won't need them at all.",
    "- Use AT MOST ONE number/metric, and only if it genuinely strengthens the point. Prefer plain narrative over metric lists ('saved 100+ hours, cut costs $1,000, reduced overhead 70%').",
    "- Avoid resume-speak and buzzwords (spearheaded, leveraged, utilized, robust, seamless, fully featured). Write plainly and specifically.",
    "- Do not invent the candidate's PAST facts — employers, titles, degrees, dates, awards, or metrics they didn't state. (Proposing NEW or hypothetical ideas for 'what would you build' questions is encouraged and is not fabrication.)",
    hasJd
      ? "- Mirror relevant job-description language only where it genuinely matches the candidate's real experience."
      : null,
    lengthRule
      ? "- If the focused example does not fit the length limit, keep the single most relevant point and cut the rest — never exceed the limit."
      : "- Respect any word/character limit stated in the question. Otherwise keep it tight: one focused paragraph unless the question clearly invites more.",
    "- Plain prose suitable for a job-application text box. No markdown headings or bullet lists unless the question explicitly asks for them.",
    "- Return ONLY valid JSON. No markdown fences. No backticks.",
    "",
    "Return JSON schema:",
    "{",
    '  "optimizedAnswer": string',
    "}",
    "",
    "Application question / prompt:",
    q,
    "",
    "Candidate template answer (base draft; may be empty):",
    draft,
    "",
    "Candidate profile JSON (experiences, projects, skills, education — factual source of truth):",
    JSON.stringify(input.profile, null, 2),
    "",
    personalContext
      ? "Personal context / about me (the candidate's own words — interests, values, goals, motivations, and the stories behind their work. PREFER this for forward-looking, motivation, and idea questions, and use it to add depth and voice to experience answers):\n" +
        personalContext
      : "Personal context: (none provided — rely on the profile and template.)",
    "",
    "skills.md (optional extra context):",
    skillsMd,
    "",
    hasJd
      ? "Job description (use to choose emphasis and vocabulary):\n" + jd
      : "Job description: (none provided.)",
    "",
    "Now produce the JSON result.",
  );

  return lines.filter((l) => l !== null).join("\n");
}

function buildResumePrompt(input: GenerateInput) {
  const p = input.profile;
  const jd = input.jd ?? "";
  const skillsMd = input.skillsMd ?? "";

  if (input.mode === "bullets") {
    // Combined select+rewrite path used by the Chrome extension
    if (input.selectBest) {
      const allExp = p.experience ?? [];
      const allProj = p.projects ?? [];
      return [
        "You are an expert resume optimizer.",
        "Goal: from ALL the user's experiences and projects, pick the best ones for the job description, then rewrite their bullets to match.",
        "",
        "Hard rules:",
        "- You MUST select EXACTLY 4 experiences (or all of them if fewer than 4 exist) and EXACTLY 2 projects (or all if fewer than 2 exist). Never return fewer IDs than the available count up to those limits.",
        "- Only use IDs that appear in the input JSON — do NOT invent or modify IDs.",
        "- Do not invent companies, titles, dates, degrees, or metrics.",
        "- Keep each bullet impact-first (action + scope + outcome + tech).",
        "- Keep bullets concise. Prefer 1 line each.",
        "- Return ONLY valid JSON matching the schema. No backticks.",
        "",
        "Return JSON schema:",
        "{",
        '  "selectedExperienceIds": string[],',
        '  "selectedProjectIds": string[],',
        '  "experienceBulletsById": { [experienceId: string]: string[] },',
        '  "projectBulletsById": { [projectId: string]: string[] },',
        '  "bulletRationaleByKey": { [key: string]: string }',
        "}",
        "",
        "bulletRationaleByKey (optional but strongly preferred):",
        "- For each bullet you materially rewrote, add one short entry (max ~140 chars) explaining how it aligns with the JD.",
        "- Keys: \"e:<experienceId>:<0-based bulletIndex>\" or \"p:<projectId>:<index>\".",
        "",
        "All experience objects (JSON):",
        JSON.stringify(allExp, null, 2),
        "",
        "All project objects (JSON):",
        JSON.stringify(allProj, null, 2),
        "",
        "skills.md (optional extra context):",
        skillsMd,
        "",
        "Job description:",
        jd,
        "",
        "Now produce the JSON result.",
      ].join("\n");
    }

    const exp = (p.experience ?? []).filter((e) =>
      (input.selectedExperienceIds ?? []).includes(e.id)
    );
    const proj = (p.projects ?? []).filter((pr) =>
      (input.selectedProjectIds ?? []).includes(pr.id)
    );

    return [
      "You are an expert resume bullet optimizer.",
      "Goal: rewrite bullets for the selected experiences/projects to best match the job description.",
      "",
      "Hard rules:",
      "- Do not invent companies, titles, dates, degrees, or metrics.",
      "- Keep each bullet impact-first (action + scope + outcome + tech).",
      "- Preserve truthiness. If a metric is not provided, do not add a number.",
      "- Keep bullets concise. Prefer 1 line each.",
      "- Return ONLY valid JSON matching the schema. No backticks.",
      "",
      "Return JSON schema:",
      "{",
      '  "experienceBulletsById": { [experienceId: string]: string[] },',
      '  "projectBulletsById": { [projectId: string]: string[] },',
      '  "bulletRationaleByKey": { [key: string]: string }',
      "}",
      "",
      "bulletRationaleByKey (optional but strongly preferred):",
      "- For each bullet you materially rewrote, add one short entry (max ~140 chars) explaining how it aligns with the JD (keywords, scope, or domain).",
      "- Keys must be exactly: \"e:<experienceId>:<0-based bulletIndex>\" or \"p:<projectId>:<index>\".",
      "- Omit keys for bullets that are unchanged from the input.",
      "",
      "Selected experience objects (JSON):",
      JSON.stringify(exp, null, 2),
      "",
      "Selected project objects (JSON):",
      JSON.stringify(proj, null, 2),
      "",
      "skills.md (optional extra context):",
      skillsMd,
      "",
      "Job description:",
      jd,
      "",
      "Now produce the JSON result.",
    ].join("\n");
  }

  return [
    "You are an expert resume optimizer.",
    "Goal: from the user's full profile, select the most relevant experiences/projects for the job description and output a tailored resume in the Jake's Resume template style as Markdown.",
    "",
    "Hard rules:",
    "- Do not invent companies, titles, dates, degrees, or metrics. You may lightly rephrase bullets but keep facts consistent.",
    "- Prefer impact + scope + tech stack. Keep bullets concise.",
    "- You MUST select exactly 4 experiences (or all of them if the profile has fewer than 4) and exactly 2 projects (or all if fewer than 2). Never return fewer than the available count up to those limits.",
    "- Return ONLY valid JSON matching the schema described below. No backticks.",
    "",
    "Return JSON schema:",
    "{",
    '  "title": string,',
    '  "selectedExperienceIds": string[],',
    '  "selectedProjectIds": string[],',
    '  "outputMarkdown": string',
    "}",
    "",
    "User profile JSON:",
    JSON.stringify(p, null, 2),
    "",
    "skills.md (optional extra context):",
    skillsMd,
    "",
    "Job description:",
    jd,
    "",
    "Now produce the JSON result.",
  ].join("\n");
}

function buildCoverLetterPrompt(input: GenerateInput) {
  const p = input.profile;
  const jd = input.jd ?? "";
  const skillsMd = input.skillsMd ?? "";
  const baseTemplate = (input.coverLetterTemplate ?? "").trim();

  return [
    "You are an expert cover letter writer.",
    "Goal: write a tailored cover letter in Markdown that fits the job description.",
    baseTemplate
      ? "The user provided a base cover letter template. Improve and tailor it for this role; keep their voice and structure where sensible."
      : "Write from scratch using the profile.",
    "",
    "Hard rules:",
    "- Do not invent facts (companies, degrees, awards).",
    "- If company name is not explicitly present in the JD, infer a reasonable placeholder like COMPANY_NAME.",
    "- Keep it 200-350 words, skimmable, confident, and specific.",
    "- Return ONLY valid JSON matching the schema described below. No backticks.",
    "",
    "Return JSON schema:",
    "{",
    '  "title": string,',
    '  "companyName": string,',
    '  "outputMarkdown": string',
    "}",
    "",
    "User profile JSON:",
    JSON.stringify(p, null, 2),
    "",
    baseTemplate ? "Base cover letter template (Markdown):\n" + baseTemplate : "",
    "",
    "skills.md (optional extra context):",
    skillsMd,
    "",
    "Job description:",
    jd,
    "",
    "Now produce the JSON result.",
  ].join("\n");
}

function extractRetryAfterSeconds(message: string): number | null {
  const m1 = message.match(/retryDelay"\s*:\s*"(\d+)s"/);
  if (m1?.[1]) return Number(m1[1]);
  const m2 = message.match(/Please retry in\s+(\d+)(?:\.\d+)?s/i);
  if (m2?.[1]) return Number(m2[1]);
  return null;
}

function isQuotaExceededZero(message: string) {
  return (
    message.includes("429") &&
    message.includes("Quota exceeded") &&
    message.includes("limit: 0")
  );
}

function parseJsonFromModelText(text: string): unknown {
  const cleaned = stripThinkingAndNoise(text);
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return JSON.");
  }
  const jsonText = cleaned.slice(start, end + 1);
  return JSON.parse(jsonText) as unknown;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  const parsed = GenerateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(parsed.error.message, { status: 400 });
  }

  const input = parsed.data;

  if (input.kind === "applicationAnswer") {
    if (!(input.applicationQuestion ?? "").trim()) {
      return new Response("applicationQuestion is required for applicationAnswer.", {
        status: 400,
      });
    }
  }

  if (input.kind === "profileBullet") {
    if (!(input.profileBulletDraft ?? "").trim()) {
      return new Response("profileBulletDraft is required for profileBullet.", {
        status: 400,
      });
    }
  }

  const providerHeader = req.headers.get("x-ai-provider")?.trim();
  const provider =
    providerHeader === "ollama" ? "ollama" : providerHeader === "groq" ? "groq" : "gemini";

  const prompt = buildPrompt(input);

  let text = "";
  if (provider === "ollama") {
    try {
      const { baseUrl, model } = getOllamaConfig(req);
      text = await ollamaCompleteJson(prompt, baseUrl, model);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return new Response(msg, { status: 502 });
    }
  } else if (provider === "groq") {
    const apiKey = getGroqApiKey(req);
    if (!apiKey) {
      return new Response(
        "Missing Groq API key. Set it in Settings (sent as x-groq-api-key) or server env GROQ_API_KEY.",
        { status: 401 },
      );
    }
    try {
      text = await groqCompleteJson(prompt, apiKey);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return new Response(msg, { status: 502 });
    }
  } else {
    const apiKey = getApiKey(req);
    if (!apiKey) {
      return new Response(
        "Missing Gemini API key. Set it in Settings (sent as x-gemini-api-key) or server env GEMINI_API_KEY.",
        { status: 401 }
      );
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const preferredModel = (process.env.GEMINI_MODEL?.trim() || "").trim();
    const modelCandidates = [
      preferredModel,
      // Google retired 2.5-series models for newer API keys in favor of 3.6 —
      // try the current model first, keep the older ones as fallback for keys
      // that still have 2.5 access.
      "gemini-3.6-flash",
      "gemini-flash-latest",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.5-pro",
      "gemini-pro-latest",
      "gemini-3-flash-preview",
      "gemini-3.1-pro-preview",
    ].filter(Boolean);

    const errors: string[] = [];
    for (const modelId of modelCandidates) {
      try {
        const model = genAI.getGenerativeModel({ model: modelId });
        const result = await model.generateContent(prompt);
        text = result.response.text();
        break;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${modelId}: ${msg}`);

        if (isQuotaExceededZero(msg)) {
          return new Response(
            [
              "Gemini quota is unavailable for this API key/project (free-tier limit is 0).",
              "",
              "Fix:",
              "- In Google AI Studio / Google Cloud, enable billing / a paid plan for the Gemini API project, OR",
              "- Use an API key from a project that has non-zero Gemini API quota, OR",
              "- Switch to Ollama in Settings for local models.",
              "",
              `Details: ${msg}`,
            ].join("\n"),
            { status: 402 }
          );
        }

        if (msg.includes("429") && msg.includes("retry")) {
          const retryAfter = extractRetryAfterSeconds(msg);
          return new Response(
            [
              "Gemini rate-limited this request.",
              retryAfter ? `Retry after: ${retryAfter}s` : "Retry after a short wait.",
              "",
              `Details: ${msg}`,
            ].join("\n"),
            {
              status: 429,
              headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
            }
          );
        }
      }
    }

    if (!text) {
      return new Response(
        [
          "Gemini request failed for all configured models.",
          "",
          "Tried:",
          ...errors.map((e) => `- ${e}`),
          "",
          "Fix:",
          "- Set a working model ID in GEMINI_MODEL, or",
          "- Use Ollama in Settings for local inference.",
        ].join("\n"),
        { status: 502 }
      );
    }
  }

  try {
    const json = parseJsonFromModelText(text);
    if (input.kind === "resume" && input.mode === "bullets" && json && typeof json === "object") {
      const o = json as Record<string, unknown>;
      const expMap =
        o.experienceBulletsById &&
        typeof o.experienceBulletsById === "object" &&
        !Array.isArray(o.experienceBulletsById)
          ? (o.experienceBulletsById as Record<string, string[]>)
          : {};
      const projMap =
        o.projectBulletsById &&
        typeof o.projectBulletsById === "object" &&
        !Array.isArray(o.projectBulletsById)
          ? (o.projectBulletsById as Record<string, string[]>)
          : {};
      const ratRaw = o.bulletRationaleByKey;
      const rat =
        ratRaw && typeof ratRaw === "object" && !Array.isArray(ratRaw)
          ? (ratRaw as Record<string, string>)
          : {};
      const effectiveExpIds = input.selectBest && Array.isArray(o.selectedExperienceIds)
        ? (o.selectedExperienceIds as string[])
        : (input.selectedExperienceIds ?? []);
      const effectiveProjIds = input.selectBest && Array.isArray(o.selectedProjectIds)
        ? (o.selectedProjectIds as string[])
        : (input.selectedProjectIds ?? []);
      o.bulletChanges = computeResumeBulletChanges(
        input.profile as Profile,
        effectiveExpIds,
        effectiveProjIds,
        expMap,
        projMap,
        rat,
      );
      delete o.bulletRationaleByKey;
    }
    return Response.json(json);
  } catch {
    // Model returned something that isn't usable JSON. Surface a short, friendly
    // message instead of dumping the entire raw output (often the echoed prompt).
    const snippet = stripThinkingAndNoise(text).replace(/\s+/g, " ").slice(0, 160);
    return new Response(
      `The model didn't return a usable answer. Try again${snippet ? ` (got: "${snippet}…")` : ""}.`,
      { status: 502 },
    );
  }
}
