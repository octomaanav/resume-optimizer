import type { Profile } from "./profile-model";

export type ResumeBulletChange = {
  kind: "experience" | "project";
  id: string;
  index: number;
  label: string;
  before: string;
  after: string;
  rationale?: string;
};

function normalizeBullet(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

function experienceLabel(
  exp: Profile["experience"][number],
): string {
  const title = (exp.title || "").trim();
  const company = (exp.company || "").trim();
  if (title && company) return `${title} @ ${company}`;
  return title || company || "Experience";
}

function projectLabel(proj: Profile["projects"][number]): string {
  const name = (proj.name || "").trim();
  const role = (proj.role || "").trim();
  if (name && role) return `${name} (${role})`;
  return name || role || "Project";
}

/**
 * Compare profile bullets to AI output and emit human-readable diffs for UI (web app + extension).
 */
export function computeResumeBulletChanges(
  profile: Profile,
  selectedExperienceIds: string[],
  selectedProjectIds: string[],
  experienceBulletsById: Record<string, string[]>,
  projectBulletsById: Record<string, string[]>,
  rationaleByKey: Record<string, string> = {},
): ResumeBulletChange[] {
  const changes: ResumeBulletChange[] = [];

  for (const id of selectedExperienceIds) {
    const exp = profile.experience.find((e) => e.id === id);
    if (!exp) continue;

    const beforeList = exp.bullets ?? [];
    const afterList = experienceBulletsById[id] ?? beforeList;
    const label = experienceLabel(exp);
    const count = Math.max(beforeList.length, afterList.length);

    for (let i = 0; i < count; i++) {
      const before = beforeList[i] ?? "";
      const after = afterList[i] ?? "";
      if (normalizeBullet(before) === normalizeBullet(after)) continue;
      if (!after.trim()) continue;

      const key = `e:${id}:${i}`;
      changes.push({
        kind: "experience",
        id,
        index: i,
        label,
        before: before.trim(),
        after: after.trim(),
        rationale: rationaleByKey[key]?.trim() || undefined,
      });
    }
  }

  for (const id of selectedProjectIds) {
    const proj = profile.projects.find((p) => p.id === id);
    if (!proj) continue;

    const beforeList = proj.bullets ?? [];
    const afterList = projectBulletsById[id] ?? beforeList;
    const label = projectLabel(proj);
    const count = Math.max(beforeList.length, afterList.length);

    for (let i = 0; i < count; i++) {
      const before = beforeList[i] ?? "";
      const after = afterList[i] ?? "";
      if (normalizeBullet(before) === normalizeBullet(after)) continue;
      if (!after.trim()) continue;

      const key = `p:${id}:${i}`;
      changes.push({
        kind: "project",
        id,
        index: i,
        label,
        before: before.trim(),
        after: after.trim(),
        rationale: rationaleByKey[key]?.trim() || undefined,
      });
    }
  }

  return changes;
}
