import type { Settings } from "./storage";

/** Headers for `/api/ai/generate` — Gemini or local Ollama. */
export function buildAiHeaders(settings: Settings): Record<string, string> {
  const provider = settings.aiProvider ?? "gemini";
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-ai-provider": provider,
  };
  if (provider === "ollama") {
    headers["x-ollama-base-url"] = (
      settings.ollamaBaseUrl ?? "http://127.0.0.1:11434"
    ).trim();
    headers["x-ollama-model"] = (settings.ollamaModel ?? "llama3.2").trim();
  } else if (provider === "groq") {
    const key = settings.groqApiKey?.trim();
    if (key) headers["x-groq-api-key"] = key;
  } else {
    const key = settings.geminiApiKey?.trim();
    if (key) headers["x-gemini-api-key"] = key;
  }
  return headers;
}
