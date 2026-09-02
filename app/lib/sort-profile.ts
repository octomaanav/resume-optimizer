import type { Profile } from "./profile-model";

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function parseOneDate(raw: string): number {
  const s = raw.trim();
  if (!s) return 0;
  const lower = s.toLowerCase();
  if (lower === "present" || lower === "current" || lower === "now") {
    return Date.now();
  }
  const ts = Date.parse(s);
  if (!Number.isNaN(ts)) return ts;
  const m = s.match(
    /^([A-Za-z]+)\s+(\d{4})(?:\s*[–-]\s*([A-Za-z]+)\s+(\d{4}))?$/i
  );
  if (m) {
    const mon = MONTHS[m[1].toLowerCase().slice(0, 3)] ?? MONTHS[m[1].toLowerCase()];
    const y = Number(m[2]);
    if (mon != null && Number.isFinite(y)) {
      return new Date(y, mon, 15).getTime();
    }
  }
  const m2 = s.match(/([A-Za-z]+)\s+(\d{4})/);
  if (m2) {
    const mon = MONTHS[m2[1].toLowerCase().slice(0, 3)] ?? MONTHS[m2[1].toLowerCase()];
    const y = Number(m2[2]);
    if (mon != null && Number.isFinite(y)) {
      return new Date(y, mon, 15).getTime();
    }
  }
  const yOnly = s.match(/^(\d{4})$/);
  if (yOnly) {
    const y = Number(yOnly[1]);
    if (Number.isFinite(y)) return new Date(y, 6, 1).getTime();
  }
  return 0;
}

/** Higher = more recent (for descending sort). Uses end date, then start. */
export function experienceSortKey(e: {
  start: string;
  end: string;
}): number {
  const endMs = parseOneDate(e.end || "");
  const startMs = parseOneDate(e.start || "");
  return Math.max(endMs, startMs) || startMs || endMs;
}

export function projectSortKey(p: {
  start: string;
  end: string;
}): number {
  const endMs = parseOneDate(p.end || "");
  const startMs = parseOneDate(p.start || "");
  return Math.max(endMs, startMs) || startMs || endMs;
}

export function sortedExperience(profile: Profile) {
  return [...profile.experience].sort(
    (a, b) => experienceSortKey(b) - experienceSortKey(a)
  );
}

export function sortedProjects(profile: Profile) {
  return [...profile.projects].sort(
    (a, b) => projectSortKey(b) - projectSortKey(a)
  );
}
