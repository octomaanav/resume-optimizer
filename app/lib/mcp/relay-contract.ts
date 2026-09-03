/**
 * relay-contract.ts — SHARED SOURCE OF TRUTH between Track A and Track B.
 *
 * Track A (MCP server) sends RelayRequest and awaits RelayResponse.
 * Track B (extension background.js) receives RelayRequest, dispatches to the
 * active tab's WebMCP handler, and replies with RelayResponse.
 *
 * DO NOT change this file without both devs agreeing — it is the only coupling
 * point between the two tracks. See MCP_PLAN.md § Work Division.
 */

/** Tools that must execute inside the user's browser tab (Plane 3). */
export const RELAYED_TOOLS = [
  /**
   * One round trip returning jd + fields + resumeFileInputs + url + title + site.
   * Maps directly onto scrapePage() in content.js — preferred over calling the
   * three narrower reads below separately.
   */
  "read_page_context",
  "scrape_job_description",
  "read_application_form",
  "detect_ats",
  "fill_application_form",
  "attach_resume",
] as const;

export type RelayedTool = (typeof RELAYED_TOOLS)[number];

export function isRelayedTool(name: string): name is RelayedTool {
  return (RELAYED_TOOLS as readonly string[]).includes(name);
}

/** Server → extension. */
export type RelayRequest = {
  /** uuid; correlates the response. */
  id: string;
  /** Pairs an MCP caller with one extension instance. */
  sessionId: string;
  tool: RelayedTool;
  input: unknown;
  /** Wall-clock ms the extension should give up after. */
  timeoutMs: number;
};

/** Extension → server. */
export type RelayResponse = {
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
};

/** Shape returned by `read_application_form` — feeds answer_application_question. */
export type FormField = {
  /** CSS selector the extension can resolve later for autofill. */
  selector: string;
  label: string;
  type: string;
  required: boolean;
  /** 0 when the form declares no limit. Flows into GenerateRequest.maxChars. */
  maxChars: number;
  options: string[];
};

/** Shape accepted by `fill_application_form` — matches autofill(answers) in content.js. */
export type FillAnswer = {
  selector: string;
  text: string;
  /**
   * The question this answer belongs to. content.js uses it to re-resolve the
   * control when a stored selector lands on a wrapper, and to refuse writing an
   * answer into a neighbouring question. Optional so older callers still work.
   */
  label?: string;
  /** Choice options as read off the page, so radio groups match by option text. */
  options?: string[];
};

export const RELAY_DEFAULT_TIMEOUT_MS = 30_000;
