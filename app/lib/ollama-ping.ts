import { formatOllamaConnectionError } from "./ollama-config";

export type OllamaPingResult =
  | { ok: true; models: string[] }
  | { ok: false; error: string };

export async function pingOllama(
  baseUrl: string,
  model: string,
): Promise<OllamaPingResult> {
  const url = `${baseUrl}/api/tags`;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 400);
      return {
        ok: false,
        error: `Ollama responded with ${res.status} at ${url}${text ? `: ${text}` : ""}`,
      };
    }
    const data = (await res.json()) as {
      models?: Array<{ name?: string; model?: string }>;
    };
    const models = (data.models ?? [])
      .map((m) => (m.name || m.model || "").trim())
      .filter(Boolean);
    return { ok: true, models };
  } catch (e) {
    return {
      ok: false,
      error: formatOllamaConnectionError(baseUrl, model, e),
    };
  }
}

export function modelIsInstalled(models: string[], wanted: string): boolean {
  const w = wanted.trim();
  if (!w) return false;
  return models.some(
    (m) => m === w || m.startsWith(`${w}:`) || w.startsWith(`${m}:`),
  );
}
