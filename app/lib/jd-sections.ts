/**
 * Job-description section segmentation.
 *
 * A posting is mostly not about the job. The company blurb, benefits, and EEO
 * boilerplate carry product and legal nouns that read as skills but are useless
 * on a résumé — Uniswap's opening paragraph alone yields "liquidity", "wallet",
 * "Layer 2", "Ethereum" and "DEX", none of which the role actually asks for.
 *
 * Scoping extraction to requirement-bearing sections removes that noise without
 * a denylist. A denylist would be wrong here: for a protocol-engineering role
 * those same terms are exactly what belongs on the résumé. Position in the
 * posting is what distinguishes them, not the words themselves.
 */

export type SectionRelevance = "include" | "exclude" | "unknown";

export type JdSection = {
  heading: string;
  body: string;
  relevance: SectionRelevance;
};

/** Sections that state what the job needs or involves. */
const INCLUDE_PATTERNS: RegExp[] = [
  /^what (you'?ll|you will|youll) (do|be doing|work on|build|own)/,
  /^what (we|we'?re|we are) (look|looking) for/,
  /^what (you'?ll|you will|you) (bring|need|have)/,
  /^(key )?responsibilities/,
  /^(the |your |about (the |this )?)?(role|position|job|opportunity)$/,
  /^in this role/,
  /^day[-\s]?to[-\s]?day/,
  /^(basic|minimum|preferred|required|desired)?\s*(qualifications|requirements)/,
  /^requirements/,
  /^qualifications/,
  /^nice[-\s]to[-\s]haves?/,
  /^bonus( points)?/,
  /^(preferred|desired)$/,
  /^(required |technical |core )?skills/,
  /^(who you are|about you|you are|you have)/,
  /^(our |the )?(tech |technology )?stack/,
  /^experience( required| we look for)?$/,
  /^what success looks like/,
];

/** Sections that describe the company, perks, or legal boilerplate. */
const EXCLUDE_PATTERNS: RegExp[] = [
  /^about (us|the company|our (company|team|mission))/,
  /^about\b(?!.*\b(role|position|job|opportunity|you)\b)/,
  /^(who we are|our (mission|story|values|culture|team))/,
  /^why (join|work|us)/,
  /^what we offer/,
  /^(benefits|perks|compensation|salary|pay)\b/,
  /^pay transparency/,
  /^equal (employment )?opportunity/,
  /^eeo\b/,
  /^(diversity|inclusion|belonging)/,
  /^(legal|disclosure|disclaimer|notice)/,
  /^(how to apply|application|interview|hiring) process/,
  /^how to apply/,
  /^life at\b/,
  /^company overview/,
  /^overview$/,
  /^e-?verify/,
];

/** Normalises a candidate heading for pattern matching. */
function normalizeHeading(line: string): string {
  return line
    .trim()
    .replace(/[:：]\s*$/, "")
    .replace(/^[#*\-–—•\s]+/, "")
    .replace(/[*_]+/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * A heading is a short standalone line that isn't prose. Bullets and sentences
 * are excluded so a line like "Requirements are listed below." isn't treated as
 * a section break.
 */
function looksLikeHeading(line: string): boolean {
  const raw = line.trim();
  if (!raw || raw.length > 80) return false;
  if (/^[-–—•*]\s/.test(raw)) return false; // list item
  if (/[.!?,;]$/.test(raw)) return false; // sentence
  return true;
}

function classify(heading: string): SectionRelevance {
  if (INCLUDE_PATTERNS.some((re) => re.test(heading))) return "include";
  if (EXCLUDE_PATTERNS.some((re) => re.test(heading))) return "exclude";
  return "unknown";
}

/** Splits a JD into headed sections. Text before the first heading is "intro". */
export function segmentJd(jd: string): JdSection[] {
  const lines = (jd ?? "").replace(/\r\n?/g, "\n").split("\n");
  const sections: JdSection[] = [];

  let heading = "";
  let relevance: SectionRelevance = "unknown";
  let buffer: string[] = [];

  const flush = () => {
    const body = buffer.join("\n").trim();
    if (heading || body) sections.push({ heading, body, relevance });
    buffer = [];
  };

  for (const line of lines) {
    if (!looksLikeHeading(line)) {
      buffer.push(line);
      continue;
    }
    const normalized = normalizeHeading(line);
    const verdict = classify(normalized);
    if (verdict === "unknown") {
      // Not a recognised section break — keep it as body text.
      buffer.push(line);
      continue;
    }
    flush();
    heading = normalized;
    relevance = verdict;
  }
  flush();

  return sections;
}

/**
 * The portion of a JD worth mining for keywords.
 *
 * Falls back to the entire text when no requirement section is recognised, so
 * an unstructured posting still produces keywords rather than none.
 */
export function relevantJdText(jd: string): string {
  const text = jd ?? "";
  if (!text.trim()) return "";

  const sections = segmentJd(text);
  const included = sections.filter((s) => s.relevance === "include");

  if (included.length === 0) return text;

  return included.map((s) => `${s.heading}\n${s.body}`).join("\n\n").trim();
}
