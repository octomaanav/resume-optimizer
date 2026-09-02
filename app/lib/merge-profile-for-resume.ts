import type { ResumeDoc, ResumeOverrides } from "./document-schemas";
import { emptyResumeOverrides } from "./document-schemas";
import { ProfileSchema, type Profile } from "./profile-model";

function mergeRecord<T extends Record<string, unknown>>(
  base: T,
  patch: Partial<T> | undefined,
): T {
  if (!patch) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const v = patch[key];
    if (v !== undefined) (out as Record<string, unknown>)[key as string] = v;
  }
  return out as T;
}

function normOverrides(doc: ResumeDoc): ResumeOverrides {
  return doc.overrides ?? emptyResumeOverrides();
}

/** Profile + this resume’s `overrides` (does not mutate global profile). */
export function mergeProfileForResume(profile: Profile, doc: ResumeDoc): Profile {
  const o = normOverrides(doc);
  const h = o.profileHeader;

  let next: Profile = { ...profile };
  if (h) {
    if (h.name !== undefined) next = { ...next, name: h.name };
    if (h.email !== undefined) next = { ...next, email: h.email };
    if (h.phone !== undefined) next = { ...next, phone: h.phone };
    if (h.location !== undefined) next = { ...next, location: h.location };
    if (h.summary !== undefined) next = { ...next, summary: h.summary };
    if (h.skills !== undefined) next = { ...next, skills: h.skills };
    if (h.skillCategories !== undefined) {
      next = { ...next, skillCategories: h.skillCategories };
    }
  }

  return ProfileSchema.parse({
    ...next,
    experience: profile.experience.map((e) =>
      mergeRecord(e, o.experience[e.id]),
    ),
    projects: profile.projects.map((p) =>
      mergeRecord(p, o.projects[p.id]),
    ),
    education: profile.education.map((ed) =>
      mergeRecord(ed, o.education[ed.id]),
    ),
    links: profile.links,
  });
}
