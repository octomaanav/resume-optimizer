import { z } from "zod";

export const SkillCategorySchema = z.object({
  id: z.string(),
  label: z.string().trim().default(""),
  items: z.array(z.string().trim()).default([]),
});

export type SkillCategory = z.infer<typeof SkillCategorySchema>;

export const ProfileSchema = z.object({
  name: z.string().trim().default(""),
  email: z.string().trim().optional().default(""),
  phone: z.string().trim().optional().default(""),
  location: z.string().trim().optional().default(""),
  links: z
    .array(
      z.object({
        id: z.string().optional(),
        label: z.string().trim(),
        url: z.string().trim(),
      }),
    )
    .default([]),
  summary: z.string().trim().optional().default(""),
  /** Legacy flat list; ignored for display/LaTeX when skillCategories is non-empty. */
  skills: z.array(z.string().trim()).default([]),
  /** Labeled groups (e.g. Technical skills, Soft skills). */
  skillCategories: z.array(SkillCategorySchema).default([]),
  experience: z
    .array(
      z.object({
        id: z.string(),
        company: z.string().trim().default(""),
        title: z.string().trim().default(""),
        location: z.string().trim().optional().default(""),
        start: z.string().trim().optional().default(""),
        end: z.string().trim().optional().default(""),
        type: z.string().trim().optional().default(""),
        bullets: z.array(z.string().trim()).default([]),
      }),
    )
    .default([]),
  projects: z
    .array(
      z.object({
        id: z.string(),
        role: z.string().trim().optional().default(""),
        name: z.string().trim().default(""),
        link: z.string().trim().optional().default(""),
        location: z.string().trim().optional().default(""),
        start: z.string().trim().optional().default(""),
        end: z.string().trim().optional().default(""),
        tech: z.array(z.string().trim()).default([]),
        bullets: z.array(z.string().trim()).default([]),
      }),
    )
    .default([]),
  education: z
    .array(
      z.object({
        id: z.string(),
        school: z.string().trim().default(""),
        degree: z.string().trim().optional().default(""),
        location: z.string().trim().optional().default(""),
        start: z.string().trim().optional().default(""),
        end: z.string().trim().optional().default(""),
        details: z.array(z.string().trim()).default([]),
      }),
    )
    .default([]),
});

export type Profile = z.infer<typeof ProfileSchema>;

export function newSkillCategoryId(): string {
  return `skillcat_${
    typeof globalThis !== "undefined" &&
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(16).slice(2)}`
  }`;
}

/**
 * If the profile still uses legacy flat `skills` and has no labeled groups yet,
 * moves those tokens into one group. Does not add groups when both are empty.
 */
export function migrateLegacyProfileSkills(p: Profile): Profile {
  if ((p.skillCategories?.length ?? 0) > 0 || p.skills.length === 0) return p;
  return {
    ...p,
    skills: [],
    skillCategories: [
      {
        id: newSkillCategoryId(),
        label: "",
        items: [...p.skills],
      },
    ],
  };
}

export function emptyProfile(): Profile {
  return ProfileSchema.parse({});
}
