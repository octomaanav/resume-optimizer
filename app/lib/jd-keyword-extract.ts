import { JD_KEYWORD_ALLOWLIST } from "./jd-keyword-allowlist";

/** Sorted longest-first at module load for boundary scans. */
const SORTED_ALLOWLIST = [...JD_KEYWORD_ALLOWLIST];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findCanonicalAllowlistTerm(token: string): string | null {
  const lower = token.toLowerCase();
  const hit = SORTED_ALLOWLIST.find((t) => t.toLowerCase() === lower);
  return hit ?? null;
}

/**
 * Inclusion-only extraction: matches only the curated allowlist + a small
 * regex pass for tokens like C++, C#, F# that must align with allowlist entries.
 */
export function extractJdKeywordsDeterministic(jd: string): string[] {
  const text = jd ?? "";
  if (!text.trim()) return [];

  const textLower = text.toLowerCase();
  const scored = new Map<string, { display: string; score: number }>();

  const bump = (display: string, pts: number) => {
    const trimmed = display.trim();
    if (!trimmed || trimmed.length > 56) return;
    const key = trimmed.toLowerCase();
    const prev = scored.get(key);
    if (prev) prev.score += pts;
    else scored.set(key, { display: trimmed, score: pts });
  };

  for (const kw of SORTED_ALLOWLIST) {
    const e = escapeRegex(kw);
    try {
      const re = new RegExp(`(^|[^a-z0-9+#])${e}($|[^a-z0-9+#])`, "gi");
      const matches = textLower.match(re);
      if (matches?.length) bump(kw, 18 + matches.length * 2);
    } catch {
      // malformed entry — skip
    }
  }

  const plusSharp =
    text.match(/\b[A-Za-z][A-Za-z0-9]*(?:\+\+|\#)\b/g) ||
    ([] as string[]);
  const singleSharp = text.match(/\b[A-Za-z]\#\b/g) || ([] as string[]);
  for (const raw of [...plusSharp, ...singleSharp]) {
    const canon = findCanonicalAllowlistTerm(raw);
    if (canon) bump(canon, 15);
  }

  const ranked = [...scored.values()].sort((a, b) => b.score - a.score);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of ranked) {
    const k = row.display.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row.display);
    if (out.length >= 45) break;
  }
  return out;
}
