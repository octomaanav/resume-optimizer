/**
 * Heuristics for keeping the Jake LaTeX resume to one page.
 *
 * There is no real text-layout engine available before compilation, so line
 * wrapping is approximated by character count. `BULLET_CHARS_PER_LINE` is
 * calibrated against the Jake template's geometry (10pt document, \small
 * bullets under a 0.15in-indented itemize) — it is deliberately conservative
 * (slightly low) so we trim a little more often rather than under-trim.
 */
export const BULLET_CHARS_PER_LINE = 98;

/** A trailing wrapped line shorter than this fraction of a full line is an "orphan". */
const ORPHAN_LINE_FRACTION = 0.32;

const DANGLING_WORDS =
  /\s+(and|or|to|with|for|of|in|on|by|the|a|an|at|as|from|into|via)$/i;

/**
 * If a bullet's last wrapped line would only carry a few trailing words,
 * trim the bullet back to the previous word boundary so that short line
 * disappears instead of eating a full extra line of vertical space.
 * Bullets that already fit on one line, or whose last line is substantial,
 * are returned unchanged.
 */
export function tightenBulletOrphanLine(
  text: string,
  charsPerLine: number = BULLET_CHARS_PER_LINE,
): string {
  const trimmedInput = text.trim();
  const len = trimmedInput.length;
  if (len <= charsPerLine) return trimmedInput;

  const lines = Math.ceil(len / charsPerLine);
  const fullLinesLen = (lines - 1) * charsPerLine;
  const lastLineLen = len - fullLinesLen;
  const orphanThreshold = Math.round(charsPerLine * ORPHAN_LINE_FRACTION);
  if (lastLineLen > orphanThreshold) return trimmedInput;

  // Walk back from the line boundary to the previous space so a word never
  // gets cut in half.
  let cut = fullLinesLen;
  while (cut > 0 && trimmedInput[cut] !== " ") cut--;
  if (cut === 0) return trimmedInput; // no safe break point; leave it alone

  let result = trimmedInput.slice(0, cut).trimEnd();
  result = result.replace(/[,;:]+$/, "");
  result = result.replace(DANGLING_WORDS, "");
  result = result.replace(/[,;:]+$/, "");

  return result || trimmedInput;
}
