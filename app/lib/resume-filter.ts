import type { Profile } from "./profile-model";

/** Experience rows for a resume: subset mode = strict id list; legacy = empty ids ⇒ all. */
export function resumeFilteredExperience(
  profile: Profile,
  subsetEnabled: boolean,
  selectedIds: string[],
) {
  if (subsetEnabled) {
    return profile.experience.filter((e) => selectedIds.includes(e.id));
  }
  if (selectedIds.length > 0) {
    return profile.experience.filter((e) => selectedIds.includes(e.id));
  }
  return profile.experience;
}

/** Project rows for a resume (same semantics as experience). */
export function resumeFilteredProjects(
  profile: Profile,
  subsetEnabled: boolean,
  selectedIds: string[],
) {
  if (subsetEnabled) {
    return profile.projects.filter((p) => selectedIds.includes(p.id));
  }
  if (selectedIds.length > 0) {
    return profile.projects.filter((p) => selectedIds.includes(p.id));
  }
  return profile.projects;
}
