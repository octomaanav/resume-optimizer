import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 120;

type AttemptResult = { ok: true; message: unknown } | { ok: false; error: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractRetryAfterSeconds(message: string): number | null {
  const m = message.match(/try again in\s+([\d.]+)s/i);
  if (m?.[1]) return Math.ceil(Number(m[1]));
  return null;
}

async function callOpenAiCompatible(
  baseUrl: string,
  model: string,
  apiKey: string,
  messages: unknown[],
  tools: unknown[] | undefined,
  extra?: Record<string, unknown>,
) {
  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: "auto",
      temperature: 0.2,
      ...extra,
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const raw = await res.text();
  return { ok: res.ok, status: res.status, raw };
}

function getKey(req: Request, headerName: string, envName: string): string {
  const headerKey = req.headers.get(headerName)?.trim();
  if (headerKey) return headerKey;
  return process.env[envName]?.trim() ?? "";
}

/** A single request, with one retry if the provider says "wait N seconds" (429/503) and N is short. */
async function attemptWithRetry(
  label: string,
  baseUrl: string,
  model: string,
  apiKey: string,
  messages: unknown[],
  tools: unknown[] | undefined,
  extra?: Record<string, unknown>,
): Promise<AttemptResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { ok, status, raw } = await callOpenAiCompatible(baseUrl, model, apiKey, messages, tools, extra);
      if (ok) {
        const data = JSON.parse(raw) as { choices?: Array<{ message?: unknown }> };
        const message = data.choices?.[0]?.message;
        if (!message) return { ok: false, error: `${label}: no message in response` };
        return { ok: true, message };
      }
      if ((status === 429 || status === 503) && attempt === 0) {
        const wait = extractRetryAfterSeconds(raw) ?? (status === 503 ? 3 : null);
        if (wait !== null && wait <= 12) {
          await sleep((wait + 0.5) * 1000);
          continue;
        }
      }
      return { ok: false, error: `${label} (${status}): ${raw.slice(0, 300)}` };
    } catch (e) {
      return { ok: false, error: `${label}: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  return { ok: false, error: `${label}: retry exhausted` };
}

async function tryGemini(req: Request, messages: unknown[], tools: unknown[] | undefined): Promise<AttemptResult> {
  const apiKey = getKey(req, "x-gemini-api-key", "GEMINI_API_KEY");
  if (!apiKey) return { ok: false, error: "Gemini: no API key configured" };
  return attemptWithRetry(
    "Gemini",
    "https://generativelanguage.googleapis.com/v1beta/openai",
    "gemini-3.6-flash",
    apiKey,
    messages,
    tools,
    // Default "thinking" effort makes tool-selection turns take 30s+ with a
    // full toolset in context — low effort cuts that to ~10-15s.
    { reasoning_effort: "low" },
  );
}

async function tryGroq(req: Request, messages: unknown[], tools: unknown[] | undefined): Promise<AttemptResult> {
  const apiKey = getKey(req, "x-groq-api-key", "GROQ_API_KEY");
  if (!apiKey) return { ok: false, error: "Groq: no API key configured" };
  for (const model of ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]) {
    const result = await attemptWithRetry("Groq", "https://api.groq.com/openai/v1", model, apiKey, messages, tools);
    if (result.ok) return result;
  }
  return { ok: false, error: "Groq: all models failed" };
}

async function tryLocal(req: Request, messages: unknown[], tools: unknown[] | undefined): Promise<AttemptResult> {
  const baseUrl = getKey(req, "x-local-llm-base-url", "LOCAL_LLM_BASE_URL");
  const model = getKey(req, "x-local-llm-model", "LOCAL_LLM_MODEL");
  const apiKey = getKey(req, "x-local-llm-api-key", "LOCAL_LLM_API_KEY");
  if (!baseUrl || !model) return { ok: false, error: "Local: no LOCAL_LLM_BASE_URL/MODEL configured" };
  return attemptWithRetry("Local model", baseUrl, model, apiKey, messages, tools);
}

const PROVIDERS: Record<string, (req: Request, messages: unknown[], tools: unknown[] | undefined) => Promise<AttemptResult>> = {
  gemini: tryGemini,
  groq: tryGroq,
  local: tryLocal,
};

// Cascade order for "auto" — Gemini first (most reliable in practice), then
// Groq, then a local model as a last resort (slow, but has no rate limit).
const CASCADE_ORDER = ["gemini", "groq", "local"];

/**
 * Thin proxy to an OpenAI-compatible tool-calling chat completions endpoint —
 * one turn in, one assistant message out. All orchestration (looping,
 * executing tool calls against document.modelContext) happens client-side,
 * since only the browser has WebMCP and page state. This route only exists
 * to keep API keys server-side.
 *
 * With no x-ai-provider header (or "auto"), it cascades through every
 * configured provider in turn instead of failing on the first one that's
 * rate-limited or down — the whole point being the caller shouldn't have to
 * babysit which provider currently works.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { messages, tools } = (body ?? {}) as { messages?: unknown; tools?: unknown };
  if (!Array.isArray(messages)) {
    return NextResponse.json({ error: "messages must be an array." }, { status: 400 });
  }
  const toolsArr = Array.isArray(tools) ? tools : undefined;

  const providerHeader = req.headers.get("x-ai-provider")?.trim();

  if (providerHeader && providerHeader !== "auto" && PROVIDERS[providerHeader]) {
    const result = await PROVIDERS[providerHeader](req, messages, toolsArr);
    if (result.ok) return NextResponse.json({ message: result.message });
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const errors: string[] = [];
  for (const name of CASCADE_ORDER) {
    const result = await PROVIDERS[name](req, messages, toolsArr);
    if (result.ok) return NextResponse.json({ message: result.message });
    errors.push(result.error);
  }

  return NextResponse.json(
    { error: ["All providers failed or aren't configured.", ...errors].join("\n") },
    { status: 502 },
  );
}
