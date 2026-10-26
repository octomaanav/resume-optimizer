import type { Profile } from "./profile-model";

export type MetricWarning = { kind: "experience" | "project"; id: string; index: number; reason: string };

function numericClaims(text: string): Set<string> {
  const normalized = text.replace(/\bp(?=\d{2}\b)/gi, "")
    .replace(/(?<=\d)[\u00a0\u202f ](?=\d{3}(?:\D|$))/gu, "");
  const matches = normalized.match(/\b\d+(?:,\d{3})*(?:\.\d+)?(?:\s*[kmb](?![a-z]))?(?:\s*%)?/gi) ?? [];
  return new Set(matches.map(raw => {
    const percent = raw.endsWith("%");
    const value = raw.replace(/%$/, "").replaceAll(",", "").replace(/\s/g, "");
    const suffix = value.match(/[kmb]$/i)?.[0]?.toLowerCase();
    const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
    return `${Number.parseFloat(value) * multiplier}:${percent ? "percent" : "number"}`;
  }));
}

/** Keep source wording when a rewrite introduces an unsupported numeric claim.
 * Equivalent formatting (12k / 12,000, narrow spaces) is allowed. This is a
 * numeric guard, not a guarantee that every narrative claim is grounded.
 */
export function guardResumeBulletMetrics(
  profile: Pick<Profile, "experience" | "projects">,
  experienceMap: Record<string, string[]>,
  projectMap: Record<string, string[]>,
): MetricWarning[] {
  const warnings: MetricWarning[] = [];
  for (const [kind, entries, map] of [
    ["experience", profile.experience, experienceMap],
    ["project", profile.projects, projectMap],
  ] as const) {
    for (const [id, bullets] of Object.entries(map)) {
      const source = entries.find(entry => entry.id === id);
      if (!source) { delete map[id]; continue; }
      const allowed = new Set(source.bullets.flatMap(bullet => [...numericClaims(bullet)]));
      map[id] = bullets.flatMap((bullet, index) => {
        if ([...numericClaims(bullet)].every(claim => allowed.has(claim))) return [bullet];
        warnings.push({ kind, id, index, reason: "Unsupported numerical claim; preserved original wording." });
        return source.bullets[index] ? [source.bullets[index]] : [];
      });
    }
  }
  return warnings;
}
