import { z } from "zod";
import { ProfileSchema, SkillCategorySchema, type Profile } from "./profile-model";

export { ProfileSchema, type Profile };

function createId(prefix: string) {
  return `${prefix}_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`}`;
}

/** Per-resume text overrides (do not change global Profile). */
export const ResumeProfileHeaderOverrideSchema = z.object({
  name: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  summary: z.string().optional(),
  skills: z.array(z.string()).optional(),
  skillCategories: z.array(SkillCategorySchema).optional(),
});

export const ResumeExperienceEntryOverrideSchema = z.object({
  company: z.string().optional(),
  title: z.string().optional(),
  location: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  type: z.string().optional(),
  bullets: z.array(z.string()).optional(),
});

export const ResumeProjectEntryOverrideSchema = z.object({
  role: z.string().optional(),
  name: z.string().optional(),
  link: z.string().optional(),
  location: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  tech: z.array(z.string()).optional(),
  bullets: z.array(z.string()).optional(),
});

export const ResumeEducationEntryOverrideSchema = z.object({
  school: z.string().optional(),
  degree: z.string().optional(),
  location: z.string().optional(),
  start: z.string().optional(),
  end: z.string().optional(),
  details: z.array(z.string()).optional(),
});

export const ResumeOverridesSchema = z.object({
  profileHeader: ResumeProfileHeaderOverrideSchema.optional(),
  experience: z
    .record(z.string(), ResumeExperienceEntryOverrideSchema)
    .default({}),
  projects: z.record(z.string(), ResumeProjectEntryOverrideSchema).default({}),
  education: z
    .record(z.string(), ResumeEducationEntryOverrideSchema)
    .default({}),
});

export type ResumeOverrides = z.infer<typeof ResumeOverridesSchema>;
export type ResumeProfileHeaderOverride = z.infer<
  typeof ResumeProfileHeaderOverrideSchema
>;
export type ResumeExperienceEntryOverride = z.infer<
  typeof ResumeExperienceEntryOverrideSchema
>;
export type ResumeProjectEntryOverride = z.infer<
  typeof ResumeProjectEntryOverrideSchema
>;
export type ResumeEducationEntryOverride = z.infer<
  typeof ResumeEducationEntryOverrideSchema
>;

export function emptyResumeOverrides(): ResumeOverrides {
  return {
    experience: {},
    projects: {},
    education: {},
  };
}

export const ResumeDocSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  template: z.literal("jake").default("jake"),
  /** When true, empty experience/project id lists mean “none”. When false, empty lists mean “all” (legacy). */
  subsetEnabled: z.boolean().default(false),
  /** `generated`: Jake TeX from profile + defaults. `custom`: use customLatex as the full document source. */
  latexMode: z.enum(["generated", "custom"]).default("generated"),
  customLatex: z.string().default(""),
  /** Copy/edit fields for this resume only (merged on top of Profile when generating). */
  overrides: ResumeOverridesSchema.optional(),
  defaults: z
    .object({
      experienceIds: z.array(z.string()).default([]),
      projectIds: z.array(z.string()).default([]),
    })
    .default({ experienceIds: [], projectIds: [] }),
  jd: z.string().trim().optional(),
  selected: z
    .object({
      experienceIds: z.array(z.string()).default([]),
      projectIds: z.array(z.string()).default([]),
    })
    .optional(),
  outputMarkdown: z.string().optional(),
  outputLatex: z.string().optional(),
});

export type ResumeDoc = z.infer<typeof ResumeDocSchema>;

export const CoverLetterDocSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  templateMarkdown: z.string().default(""),
  jd: z.string().trim().optional(),
  companyName: z.string().trim().optional(),
  outputMarkdown: z.string().optional(),
});

export type CoverLetterDoc = z.infer<typeof CoverLetterDocSchema>;

export const ResumeOptimizationSchema = z.object({
  baseResumeId: z.string(),
  jd: z.string().trim(),
  createdAt: z.number(),
  model: z.string().optional(),
  selectedExperienceIds: z.array(z.string()).default([]),
  selectedProjectIds: z.array(z.string()).default([]),
  outputMarkdown: z.string().default(""),
  outputLatex: z.string().default(""),
  experienceBulletsById: z
    .record(z.string(), z.array(z.string()))
    .optional()
    .default({}),
  projectBulletsById: z
    .record(z.string(), z.array(z.string()))
    .optional()
    .default({}),
});

export type ResumeOptimization = z.infer<typeof ResumeOptimizationSchema>;

export const CoverLetterOptimizationSchema = z.object({
  baseCoverLetterId: z.string(),
  jd: z.string().trim(),
  createdAt: z.number(),
  model: z.string().optional(),
  companyName: z.string().default(""),
  outputMarkdown: z.string().default(""),
});

export type CoverLetterOptimization = z.infer<typeof CoverLetterOptimizationSchema>;

export const SettingsSchema = z.object({
  aiProvider: z.enum(["gemini", "groq", "ollama"]).default("gemini"),
  geminiApiKey: z.string().trim().optional().default(""),
  groqApiKey: z.string().trim().optional().default(""),
  ollamaBaseUrl: z.string().trim().optional().default("http://127.0.0.1:11434"),
  ollamaModel: z.string().trim().optional().default("llama3.2"),
  skillsMd: z.string().default(""),
  // Free-form "about me" context the résumé can't hold: interests, values,
  // goals, and richer project narratives. Fed to AI answer generation.
  personalContext: z.string().default(""),
});

export type Settings = z.infer<typeof SettingsSchema>;

export const ApplicationQuestionSchema = z.object({
  id: z.string(),
  question: z.string().trim().min(1),
  answer: z.string().default(""),
  updatedAt: z.number(),
});

export type ApplicationQuestion = z.infer<typeof ApplicationQuestionSchema>;

export const ApplicationAnswerDocSchema = z.object({
  id: z.string(),
  title: z.string().trim().min(1),
  createdAt: z.number(),
  updatedAt: z.number(),
  question: z.string().default(""),
  templateAnswer: z.string().default(""),
  // Originating job board ("workday", "greenhouse", "lever", …) or "" for generic.
  // Used to group Q&A templates by board since the same question is phrased
  // differently across ATS platforms.
  source: z.string().default(""),
});

export type ApplicationAnswerDoc = z.infer<typeof ApplicationAnswerDocSchema>;

export const ApplicationAnswerOptimizationSchema = z.object({
  baseApplicationAnswerId: z.string(),
  jd: z.string().trim(),
  createdAt: z.number(),
  model: z.string().optional(),
  tailoredAnswer: z.string().default(""),
});

export type ApplicationAnswerOptimization = z.infer<
  typeof ApplicationAnswerOptimizationSchema
>;

export function createResumeDraft(
  title: string,
  opts?: {
    subsetEnabled?: boolean;
    experienceIds?: string[];
    projectIds?: string[];
  },
): ResumeDoc {
  const now = Date.now();
  return ResumeDocSchema.parse({
    id: createId("res"),
    title,
    createdAt: now,
    updatedAt: now,
    template: "jake",
    subsetEnabled: opts?.subsetEnabled ?? false,
    latexMode: "generated",
    customLatex: "",
    overrides: emptyResumeOverrides(),
    defaults: {
      experienceIds: opts?.experienceIds ?? [],
      projectIds: opts?.projectIds ?? [],
    },
  });
}

export function createCoverLetterDraft(title: string): CoverLetterDoc {
  const now = Date.now();
  return CoverLetterDocSchema.parse({
    id: createId("cl"),
    title,
    createdAt: now,
    updatedAt: now,
    templateMarkdown: "",
  });
}

export function createApplicationAnswerDraft(title: string): ApplicationAnswerDoc {
  const now = Date.now();
  return ApplicationAnswerDocSchema.parse({
    id: createId("aa"),
    title: title.trim(),
    question: "",
    templateAnswer: "",
    createdAt: now,
    updatedAt: now,
  });
}

const ResumeOptMapSchema = z.record(z.string(), ResumeOptimizationSchema);
const CoverOptMapSchema = z.record(z.string(), CoverLetterOptimizationSchema);
const AppAnswerOptMapSchema = z.record(
  z.string(),
  ApplicationAnswerOptimizationSchema,
);

export const WorkspacePayloadSchema = z.object({
  settings: SettingsSchema,
  resumes: z.array(ResumeDocSchema),
  coverLetters: z.array(CoverLetterDocSchema),
  applicationAnswerDocs: z.array(ApplicationAnswerDocSchema),
  resumeOptimizations: ResumeOptMapSchema,
  coverLetterOptimizations: CoverOptMapSchema,
  applicationAnswerOptimizations: AppAnswerOptMapSchema,
});

export type WorkspacePayload = z.infer<typeof WorkspacePayloadSchema>;

export const WorkspacePatchSchema = z
  .object({
    settings: SettingsSchema.optional(),
    resumes: z.array(ResumeDocSchema).optional(),
    coverLetters: z.array(CoverLetterDocSchema).optional(),
    applicationAnswerDocs: z.array(ApplicationAnswerDocSchema).optional(),
    resumeOptimizations: ResumeOptMapSchema.optional(),
    coverLetterOptimizations: CoverOptMapSchema.optional(),
    applicationAnswerOptimizations: AppAnswerOptMapSchema.optional(),
  })
  .strict();

export type WorkspacePatch = z.infer<typeof WorkspacePatchSchema>;

export function defaultWorkspacePayload(): WorkspacePayload {
  return WorkspacePayloadSchema.parse({
    settings: {},
    resumes: [],
    coverLetters: [],
    applicationAnswerDocs: [],
    resumeOptimizations: {},
    coverLetterOptimizations: {},
    applicationAnswerOptimizations: {},
  });
}
