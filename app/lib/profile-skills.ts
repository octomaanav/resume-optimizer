import type { Profile } from "./profile-model";

/** True when labeled skill groups are in use (legacy flat `skills` is ignored for export). */
export function usesSkillCategories(p: Profile): boolean {
  return (p.skillCategories?.length ?? 0) > 0;
}

/** All skill tokens in order (for search / AI context). */
export function profileSkillsFlat(p: Profile): string[] {
  if (usesSkillCategories(p)) {
    return p.skillCategories.flatMap((c) => c.items);
  }
  return p.skills;
}

export type ProfileSkillRow = { label: string; line: string };

/** Rows for resume PDF / preview: one line per label group, or one legacy line. */
export function profileSkillDisplayRows(p: Profile): ProfileSkillRow[] {
  if (usesSkillCategories(p)) {
    return p.skillCategories.map((c) => ({
      label: (c.label || "Skills").trim() || "Skills",
      line: c.items.join(", "),
    }));
  }
  if (p.skills.length > 0) {
    return [{ label: "Skills", line: p.skills.join(", ") }];
  }
  return [];
}
