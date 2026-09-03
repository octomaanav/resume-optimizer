import { buildAiHeaders } from "../ai-client";
import {
  createApplicationAnswerDraft,
  createCoverLetterDraft,
  createResumeDraft,
  type ApplicationAnswerDoc,
  type CoverLetterDoc,
  type ResumeDoc,
} from "../document-schemas";
import { renderJakeResumeTex } from "../jake-latex";
import { mergeProfileForResume } from "../merge-profile-for-resume";
import type { ResumeBulletChange } from "../resume-bullet-diff";
import { APPLY_FORM_FIELDS, type ApplyFormField } from "./apply-form-store";
import type { WebMcpContext, WebMcpToolDescriptor } from "./types";

/** WebMCP tool outputs are capped (~1.5K chars per the spec's guardrails) — keep every reply short and point back at the app for full detail. */
function truncate(s: string, max: number): string {
  const trimmed = s.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

function hasProfileData(ctx: WebMcpContext): boolean {
  const p = ctx.getProfile();
  return Boolean(p.name.trim()) || p.experience.length > 0 || p.projects.length > 0;
}

const NO_PROFILE_MESSAGE =
  "No profile data is available for this session. Sign in and fill out the Profile page first, then try again.";

// ---------- pick-or-create helpers (mirror how the optimize pages pick a base doc) ----------

function pickOrCreateResume(
  resumes: ResumeDoc[],
  titleHint?: string,
): { doc: ResumeDoc; isNew: boolean } {
  const q = (titleHint ?? "").trim().toLowerCase();
  if (q) {
    const match = resumes.find((r) => r.title.toLowerCase().includes(q));
    if (match) return { doc: match, isNew: false };
  }
  if (resumes.length > 0) {
    const sorted = [...resumes].sort((a, b) => b.updatedAt - a.updatedAt);
    return { doc: sorted[0], isNew: false };
  }
  return { doc: createResumeDraft(titleHint?.trim() || "AI Draft"), isNew: true };
}

function pickOrCreateCoverLetter(
  letters: CoverLetterDoc[],
  titleHint?: string,
): { doc: CoverLetterDoc; isNew: boolean } {
  const q = (titleHint ?? "").trim().toLowerCase();
  if (q) {
    const match = letters.find((l) => l.title.toLowerCase().includes(q));
    if (match) return { doc: match, isNew: false };
  }
  if (letters.length > 0) {
    const sorted = [...letters].sort((a, b) => b.updatedAt - a.updatedAt);
    return { doc: sorted[0], isNew: false };
  }
  return { doc: createCoverLetterDraft(titleHint?.trim() || "AI Draft"), isNew: true };
}

function pickOrCreateAnswerDoc(
  docs: ApplicationAnswerDoc[],
  question: string,
  titleHint?: string,
): { doc: ApplicationAnswerDoc; isNew: boolean } {
  const qTitle = (titleHint ?? "").trim().toLowerCase();
  if (qTitle) {
    const match = docs.find((d) => d.title.toLowerCase().includes(qTitle));
    if (match) return { doc: match, isNew: false };
  }
  const qq = question.trim().toLowerCase();
  const byQuestion = docs.find((d) => d.question.trim().toLowerCase() === qq);
  if (byQuestion) return { doc: byQuestion, isNew: false };
  const draft = createApplicationAnswerDraft(question.slice(0, 60) || "AI Answer");
  return { doc: { ...draft, question }, isNew: true };
}

// ---------- get_profile ----------

function execGetProfile(ctx: WebMcpContext): string {
  if (!hasProfileData(ctx)) return NO_PROFILE_MESSAGE;
  const p = ctx.getProfile();
  const skills = (p.skillCategories.length > 0
    ? p.skillCategories.flatMap((c) => c.items)
    : p.skills
  ).slice(0, 12);
  const exp = p.experience.slice(0, 8).map((e) => `${e.title || "?"} @ ${e.company || "?"}`);
  const proj = p.projects.slice(0, 6).map((pr) => pr.name || "?");
  const lines = [
    `Name: ${p.name || "(not set)"}`,
    `Email: ${p.email || "(not set)"}`,
    `Phone: ${p.phone || "(not set)"}`,
    `Location: ${p.location || "(not set)"}`,
    `Summary: ${(p.summary || "").slice(0, 200) || "(none)"}`,
    `Skills: ${skills.join(", ") || "(none)"}`,
    `Experience: ${exp.join("; ") || "(none)"}`,
    `Projects: ${proj.join("; ") || "(none)"}`,
  ];
  return truncate(lines.join("\n"), 1400);
}

// ---------- list_documents ----------

function execListDocuments(ctx: WebMcpContext): string {
  const w = ctx.getWorkspace();
  const lines: string[] = [
    w.resumes.length
      ? `Resumes: ${w.resumes.slice(0, 10).map((r) => r.title).join(", ")}`
      : "Resumes: none yet.",
    w.coverLetters.length
      ? `Cover letters: ${w.coverLetters.slice(0, 10).map((c) => c.title).join(", ")}`
      : "Cover letters: none yet.",
    w.applicationAnswerDocs.length
      ? `Q&A templates: ${w.applicationAnswerDocs.slice(0, 10).map((d) => d.title).join(", ")}`
      : "Q&A templates: none yet.",
  ];
  return truncate(lines.join("\n"), 1400);
}

// ---------- optimize_resume ----------

async function execOptimizeResume(
  input: Record<string, unknown>,
  ctx: WebMcpContext,
): Promise<string> {
  const jd = String(input.jobDescription ?? "").trim();
  if (!jd) return "Please provide a jobDescription to tailor the resume to.";
  if (!hasProfileData(ctx)) return NO_PROFILE_MESSAGE;

  const workspace = ctx.getWorkspace();
  const titleHint = typeof input.resumeTitle === "string" ? input.resumeTitle : undefined;
  const { doc, isNew } = pickOrCreateResume(workspace.resumes, titleHint);
  const resumeProfile = mergeProfileForResume(ctx.getProfile(), doc);

  const res = await fetch("/api/ai/generate", {
    method: "POST",
    headers: buildAiHeaders(workspace.settings),
    body: JSON.stringify({
      kind: "resume",
      mode: "bullets",
      selectBest: true,
      profile: resumeProfile,
      jd,
      skillsMd: workspace.settings.skillsMd ?? "",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return truncate(`Resume optimization failed: ${text}`, 500);
  }

  const data = (await res.json()) as {
    selectedExperienceIds?: string[];
    selectedProjectIds?: string[];
    experienceBulletsById?: Record<string, string[]>;
    projectBulletsById?: Record<string, string[]>;
    bulletChanges?: ResumeBulletChange[];
  };

  const selExp = data.selectedExperienceIds ?? [];
  const selProj = data.selectedProjectIds ?? [];
  const expMap = data.experienceBulletsById ?? {};
  const projMap = data.projectBulletsById ?? {};

  const outputLatex = renderJakeResumeTex({
    profile: resumeProfile,
    experienceIds: selExp,
    projectIds: selProj,
    subsetEnabled: selExp.length > 0 || selProj.length > 0,
    title: doc.title,
    experienceBulletsById: expMap,
    projectBulletsById: projMap,
    highlightMetrics: true,
  });

  let saved = true;
  try {
    await ctx.patchWorkspace({
      resumes: isNew ? [...workspace.resumes, doc] : workspace.resumes,
      resumeOptimizations: {
        ...workspace.resumeOptimizations,
        [doc.id]: {
          baseResumeId: doc.id,
          jd,
          createdAt: Date.now(),
          selectedExperienceIds: selExp,
          selectedProjectIds: selProj,
          outputMarkdown: "",
          outputLatex,
          experienceBulletsById: expMap,
          projectBulletsById: projMap,
        },
      },
    });
  } catch {
    saved = false;
  }

  const rationale = (data.bulletChanges ?? [])
    .map((c) => c.rationale)
    .filter((r): r is string => Boolean(r))
    .slice(0, 2);

  const parts = [
    `Tailored "${doc.title}": selected ${selExp.length} role${selExp.length === 1 ? "" : "s"} and ${selProj.length} project${selProj.length === 1 ? "" : "s"}, rewrote their bullets for this JD.`,
  ];
  if (rationale.length) parts.push(`Why: ${rationale.join(" ")}`);
  parts.push(
    saved
      ? `Open /optimize/resume?baseId=${doc.id} in the app to review, or call export_resume_pdf.`
      : "Not saved — sign in to persist this result.",
  );
  return truncate(parts.join(" "), 1400);
}

// ---------- export_resume_pdf ----------

async function execExportResumePdf(
  input: Record<string, unknown>,
  ctx: WebMcpContext,
): Promise<string> {
  const workspace = ctx.getWorkspace();
  if (workspace.resumes.length === 0) {
    return "No resumes yet — call optimize_resume first to build one.";
  }
  const titleHint = typeof input.resumeTitle === "string" ? input.resumeTitle : undefined;
  const { doc } = pickOrCreateResume(workspace.resumes, titleHint);
  const resumeProfile = mergeProfileForResume(ctx.getProfile(), doc);
  const opt = workspace.resumeOptimizations[doc.id];

  const selExp = opt?.selectedExperienceIds ?? doc.selected?.experienceIds ?? doc.defaults.experienceIds;
  const selProj = opt?.selectedProjectIds ?? doc.selected?.projectIds ?? doc.defaults.projectIds;
  const latex =
    opt?.outputLatex?.trim() ||
    renderJakeResumeTex({
      profile: resumeProfile,
      experienceIds: selExp,
      projectIds: selProj,
      subsetEnabled: selExp.length > 0 || selProj.length > 0,
      title: doc.title,
      experienceBulletsById: opt?.experienceBulletsById ?? {},
      projectBulletsById: opt?.projectBulletsById ?? {},
      highlightMetrics: true,
    });

  const res = await fetch("/api/latex/pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ latex }),
  });

  if (!res.ok) {
    const ct = res.headers.get("content-type") ?? "";
    let msg = `PDF compile failed (${res.status}).`;
    if (ct.includes("application/json")) {
      const j = (await res.json()) as { error?: string; stderr?: string };
      msg = [j.error, j.stderr].filter(Boolean).join(" ") || msg;
    }
    return truncate(msg, 500);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  ctx.announcePdf(doc.title, url);
  return `PDF ready for "${doc.title}" — a download link just appeared at the top of the app.`;
}

// ---------- answer_application_question ----------

async function execAnswerQuestion(
  input: Record<string, unknown>,
  ctx: WebMcpContext,
): Promise<string> {
  const question = String(input.question ?? "").trim();
  if (!question) return "Please provide the application question to answer.";
  if (!hasProfileData(ctx)) return NO_PROFILE_MESSAGE;

  const jd = typeof input.jobDescription === "string" ? input.jobDescription.trim() : "";
  const maxChars = typeof input.maxChars === "number" && input.maxChars > 0 ? input.maxChars : 0;
  const maxWords = typeof input.maxWords === "number" && input.maxWords > 0 ? input.maxWords : 0;

  const workspace = ctx.getWorkspace();
  const titleHint = typeof input.answerTitle === "string" ? input.answerTitle : undefined;
  const { doc, isNew } = pickOrCreateAnswerDoc(workspace.applicationAnswerDocs, question, titleHint);

  const res = await fetch("/api/ai/generate", {
    method: "POST",
    headers: buildAiHeaders(workspace.settings),
    body: JSON.stringify({
      kind: "applicationAnswer",
      profile: ctx.getProfile(),
      jd,
      skillsMd: workspace.settings.skillsMd ?? "",
      personalContext: workspace.settings.personalContext ?? "",
      applicationQuestion: doc.question || question,
      draftAnswer: doc.templateAnswer ?? "",
      maxChars,
      maxWords,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return truncate(`Answer generation failed: ${text}`, 500);
  }

  const data = (await res.json()) as { optimizedAnswer?: string };
  const answer = (data.optimizedAnswer ?? "").trim();
  if (!answer) return "The model returned an empty answer — try again.";

  let saved = true;
  try {
    await ctx.patchWorkspace({
      applicationAnswerDocs: isNew
        ? [...workspace.applicationAnswerDocs, doc]
        : workspace.applicationAnswerDocs,
      applicationAnswerOptimizations: {
        ...workspace.applicationAnswerOptimizations,
        [doc.id]: {
          baseApplicationAnswerId: doc.id,
          jd,
          createdAt: Date.now(),
          tailoredAnswer: answer,
        },
      },
    });
  } catch {
    saved = false;
  }

  const note = saved ? "" : "\n\n(Not saved — sign in to persist this answer.)";
  return truncate(`${answer}${note}`, 1500);
}

// ---------- optimize_cover_letter ----------

async function execOptimizeCoverLetter(
  input: Record<string, unknown>,
  ctx: WebMcpContext,
): Promise<string> {
  const jd = String(input.jobDescription ?? "").trim();
  if (!jd) return "Please provide a jobDescription to tailor the cover letter to.";
  if (!hasProfileData(ctx)) return NO_PROFILE_MESSAGE;

  const workspace = ctx.getWorkspace();
  const titleHint = typeof input.coverLetterTitle === "string" ? input.coverLetterTitle : undefined;
  const { doc, isNew } = pickOrCreateCoverLetter(workspace.coverLetters, titleHint);

  const res = await fetch("/api/ai/generate", {
    method: "POST",
    headers: buildAiHeaders(workspace.settings),
    body: JSON.stringify({
      kind: "coverLetter",
      profile: ctx.getProfile(),
      jd,
      skillsMd: workspace.settings.skillsMd ?? "",
      coverLetterTemplate: doc.templateMarkdown ?? "",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return truncate(`Cover letter generation failed: ${text}`, 500);
  }

  const data = (await res.json()) as { companyName?: string; outputMarkdown: string };
  const letter = (data.outputMarkdown ?? "").trim();
  if (!letter) return "The model returned an empty letter — try again.";

  let saved = true;
  try {
    await ctx.patchWorkspace({
      coverLetters: isNew ? [...workspace.coverLetters, doc] : workspace.coverLetters,
      coverLetterOptimizations: {
        ...workspace.coverLetterOptimizations,
        [doc.id]: {
          baseCoverLetterId: doc.id,
          jd,
          createdAt: Date.now(),
          companyName: data.companyName ?? "",
          outputMarkdown: letter,
        },
      },
    });
  } catch {
    saved = false;
  }

  const looksLikeLetterhead = (line: string) =>
    line.includes("@") || /\d{3}[-.\s]?\d{3}/.test(line) || line.length < 25;
  const preview = letter
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !looksLikeLetterhead(l))
    .slice(0, 2)
    .join(" ")
    .slice(0, 220);
  const companyBit = data.companyName ? ` For ${data.companyName}.` : "";
  const where = saved
    ? ` Open /optimize/cover-letter?baseId=${doc.id} to read and export the full letter.`
    : " Not saved — sign in to persist.";
  return truncate(`Wrote a tailored cover letter for "${doc.title}".${companyBit} Preview: ${preview}…${where}`, 1500);
}

// ---------- fill_application_field / submit_application (demo apply form) ----------

const FIELD_LABEL: Record<ApplyFormField, string> = {
  firstName: "first name",
  lastName: "last name",
  email: "email",
  phone: "phone",
  whyThisRole: "\"why this role\" answer",
  relevantProject: "\"relevant project\" answer",
};

function execFillApplicationField(input: Record<string, unknown>, ctx: WebMcpContext): string {
  const field = input.field;
  const value = String(input.value ?? "").trim();
  if (typeof field !== "string" || !(APPLY_FORM_FIELDS as readonly string[]).includes(field)) {
    return `Unknown field. Valid fields: ${APPLY_FORM_FIELDS.join(", ")}.`;
  }
  if (!value) return "Please provide a non-empty value.";
  ctx.fillApplyField(field as ApplyFormField, value);
  return `Filled ${FIELD_LABEL[field as ApplyFormField]} on the application form.`;
}

function execSubmitApplication(_input: Record<string, unknown>, ctx: WebMcpContext): string {
  const result = ctx.submitApplyForm();
  if (!result.ok) {
    return `Can't submit yet — still missing: ${result.missing.map((f) => FIELD_LABEL[f]).join(", ")}.`;
  }
  return "Application submitted.";
}

// ---------- registry ----------

export function buildWebMcpTools(): WebMcpToolDescriptor[] {
  return [
    {
      name: "get_profile",
      description:
        "Read the signed-in user's resume profile: name, summary, skills, work experience, and projects. Call this first to see what material is available before tailoring anything.",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: { readOnlyHint: true },
      execute: async (_input, ctx) => execGetProfile(ctx),
    },
    {
      name: "list_documents",
      description:
        "List the user's saved resumes, cover letters, and application Q&A templates by title, so you know what already exists before creating or tailoring one.",
      inputSchema: { type: "object", properties: {}, required: [] },
      annotations: { readOnlyHint: true },
      execute: async (_input, ctx) => execListDocuments(ctx),
    },
    {
      name: "optimize_resume",
      description:
        "Tailor the user's resume to a job description: selects the most relevant work experience and projects from their profile and rewrites the bullet points to match, without inventing facts. Saves the result and opens it in the app to review and export.",
      inputSchema: {
        type: "object",
        properties: {
          jobDescription: {
            type: "string",
            description: "Full text of the job posting to tailor the resume to.",
          },
          resumeTitle: {
            type: "string",
            description: "Title of an existing resume to update. Omit to use the most recent one.",
          },
        },
        required: ["jobDescription"],
      },
      execute: (input, ctx) => execOptimizeResume(input, ctx),
    },
    {
      name: "export_resume_pdf",
      description:
        "Compile the user's most recently tailored resume (or one matched by title) into a downloadable PDF using the Jake resume template. Opens a download link in the app.",
      inputSchema: {
        type: "object",
        properties: {
          resumeTitle: {
            type: "string",
            description: "Title of the resume to export. Omit to use the most recently updated one.",
          },
        },
        required: [],
      },
      execute: (input, ctx) => execExportResumePdf(input, ctx),
    },
    {
      name: "answer_application_question",
      description:
        "Write a genuine, first-person answer to a job application question, grounded in the user's real profile. Respects a character or word limit if given. Saves the answer and returns its text.",
      inputSchema: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "The exact application question or essay prompt to answer.",
          },
          jobDescription: {
            type: "string",
            description: "Job description text, used to choose emphasis and vocabulary.",
          },
          maxChars: {
            type: "number",
            description: "Hard character limit the form enforces, if any.",
          },
          maxWords: {
            type: "number",
            description: "Hard word limit the form enforces, if any.",
          },
          answerTitle: {
            type: "string",
            description: "Title of an existing saved answer template to reuse.",
          },
        },
        required: ["question"],
      },
      execute: (input, ctx) => execAnswerQuestion(input, ctx),
    },
    {
      name: "optimize_cover_letter",
      description:
        "Write a tailored cover letter for a job description, grounded in the user's profile. Saves it and returns a short preview plus where to read the full letter.",
      inputSchema: {
        type: "object",
        properties: {
          jobDescription: {
            type: "string",
            description: "Full text of the job posting to tailor the cover letter to.",
          },
          coverLetterTitle: {
            type: "string",
            description: "Title of an existing cover letter to update. Omit to use the most recent one.",
          },
        },
        required: ["jobDescription"],
      },
      execute: (input, ctx) => execOptimizeCoverLetter(input, ctx),
    },
    {
      name: "fill_application_field",
      description:
        "Fill one field on the demo job application form at /apply (this site's own page, for demoing agent-filled applications). Call once per field. Combine with answer_application_question to write the essay-style fields first.",
      inputSchema: {
        type: "object",
        properties: {
          field: {
            type: "string",
            enum: [...APPLY_FORM_FIELDS],
            description: "Which field to fill: firstName, lastName, email, phone, whyThisRole, or relevantProject.",
          },
          value: {
            type: "string",
            description: "The text to put in that field.",
          },
        },
        required: ["field", "value"],
      },
      execute: (input, ctx) => execFillApplicationField(input, ctx),
    },
    {
      name: "submit_application",
      description:
        "Submit the demo job application form at /apply once its required fields (first name, last name, email, and the \"why this role\" answer) are filled.",
      inputSchema: { type: "object", properties: {}, required: [] },
      execute: (_input, ctx) => execSubmitApplication(_input, ctx),
    },
  ];
}
