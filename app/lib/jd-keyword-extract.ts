import { relevantJdText } from "./jd-sections";
import {
  JD_KEYWORD_ALLOWLIST,
  JD_KEYWORD_CASE_SENSITIVE,
  JD_KEYWORD_SOFT_TERMS,
} from "./jd-keyword-allowlist";

/** Sorted longest-first at module load so phrases win over their fragments. */
const SORTED_ALLOWLIST = [...JD_KEYWORD_ALLOWLIST];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findCanonicalAllowlistTerm(token: string): string | null {
  const lower = token.toLowerCase();
  return SORTED_ALLOWLIST.find((t) => t.toLowerCase() === lower) ?? null;
}

/** Counts non-overlapping matches without the trailing-delimiter loss of `match`. */
function countMatches(haystack: string, term: string, caseSensitive: boolean) {
  const e = escapeRegex(term);
  // Lookahead for the trailing boundary so adjacent occurrences aren't skipped.
  // `&` counts as part of a token, so "R&D" cannot yield the R language and
  // "AT&T" cannot yield stray single letters.
  const re = new RegExp(
    `(^|[^a-z0-9+#&])(${e})(?=$|[^a-z0-9+#&])`,
    caseSensitive ? "g" : "gi",
  );
  let n = 0;
  while (re.exec(haystack) !== null) n += 1;
  return n;
}

const wordCount = (s: string) => s.trim().split(/\s+/).length;

/**
 * Inclusion-only extraction against the curated allowlist.
 *
 * Deliberately does NOT harvest arbitrary capitalised tokens: a JD is full of
 * all-caps noise (NYC, EEO, E-Verify, DEX in a legal footer) and harvesting it
 * produces a keyword list that is mostly locations and legal boilerplate.
 * Every term returned here is one somebody curated as resume-relevant.
 *
 * Ranking favours specificity over raw frequency, so a single mention of
 * "smart contracts" outranks four mentions of "ownership".
 */
export function extractJdKeywordsDeterministic(jd: string): string[] {
  // Scope to requirement-bearing sections; the company blurb, benefits and EEO
  // text contribute product and legal nouns that read as skills but aren't.
  const text = relevantJdText(jd ?? "");
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
    const lower = kw.toLowerCase();
    const caseSensitive = JD_KEYWORD_CASE_SENSITIVE.has(lower);

    let hits: number;
    try {
      hits = caseSensitive
        ? countMatches(text, kw.toUpperCase(), true) +
          countMatches(text, kw.charAt(0).toUpperCase() + kw.slice(1), true)
        : countMatches(textLower, lower, false);
    } catch {
      continue; // malformed entry
    }
    if (!hits) continue;

    // Specificity first: multi-word phrases and longer terms are more
    // informative than a common single word that happens to repeat.
    const specificity = (wordCount(kw) - 1) * 8 + Math.min(kw.length, 20);
    const frequency = Math.min(hits, 4) * 3;
    const softPenalty = JD_KEYWORD_SOFT_TERMS.has(lower) ? 14 : 0;

    bump(kw, 12 + specificity + frequency - softPenalty);
  }

  // C++/C#/F# need their own pass — the boundary class above excludes + and #.
  const plusSharp = text.match(/\b[A-Za-z][A-Za-z0-9]*(?:\+\+|#)/g) ?? [];
  const singleSharp = text.match(/\b[A-Za-z]#/g) ?? [];
  for (const raw of [...plusSharp, ...singleSharp]) {
    const canon = findCanonicalAllowlistTerm(raw);
    if (canon) bump(canon, 30);
  }

  const ranked = [...scored.values()].sort(
    (a, b) => b.score - a.score || a.display.localeCompare(b.display),
  );

  /*
   * Drop fragments of phrases that also matched: if "smart contracts" is in,
   * "smart contract" adds nothing. Longer/higher-scoring terms are visited
   * first, so a later term contained in one already kept is redundant.
   */
  const out: string[] = [];
  const kept: string[] = [];
  for (const row of ranked) {
    const lower = row.display.toLowerCase();
    const redundant = kept.some((k) => {
      if (k === lower) return true;
      // Word-boundary containment in either direction (plurals included).
      const a = k.replace(/s$/, "");
      const b = lower.replace(/s$/, "");
      return a === b || k.includes(` ${lower} `) || k.startsWith(`${lower} `) ||
        k.endsWith(` ${lower}`);
    });
    if (redundant) continue;
    kept.push(lower);
    out.push(row.display);
    if (out.length >= 40) break;
  }

  return out;
}
