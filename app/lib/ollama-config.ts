/** Shared Ollama URL/model resolution for API routes. */
export function normalizeOllamaBaseUrl(url: string): string {
  let u = url.trim().replace(/\/$/, "");
  u = u.replace(/^http:\/\/localhost(?::\d+)?/i, (m) =>
    m.replace(/localhost/i, "127.0.0.1"),
  );
  return u;
}

export function getOllamaConfig(req: Request) {
  const raw =
    req.headers.get("x-ollama-base-url")?.trim() ||
    process.env.OLLAMA_HOST?.trim() ||
    "http://127.0.0.1:11434";
  const model =
    req.headers.get("x-ollama-model")?.trim() ||
    process.env.OLLAMA_MODEL?.trim() ||
    "llama3.2";
  return { baseUrl: normalizeOllamaBaseUrl(raw), model };
}

export function formatOllamaConnectionError(
  baseUrl: string,
  model: string,
  cause: unknown,
): string {
  const detail =
    cause instanceof Error ? cause.message : String(cause ?? "unknown error");
  return [
    `Cannot reach Ollama at ${baseUrl}.`,
    "",
    "1. Start Ollama:  ollama serve",
    `2. Pull the model: ollama pull ${model}`,
    "3. In web app Settings, confirm Ollama base URL is http://127.0.0.1:11434",
    "",
    `(${detail})`,
  ].join("\n");
}
