import { NextResponse } from "next/server";

import { getOllamaConfig } from "@/app/lib/ollama-config";
import { modelIsInstalled, pingOllama } from "@/app/lib/ollama-ping";

export const runtime = "nodejs";

/** Quick Ollama connectivity check (extension + settings UI). */
export async function GET(req: Request) {
  const { baseUrl, model } = getOllamaConfig(req);
  const ping = await pingOllama(baseUrl, model);

  if (!ping.ok) {
    return NextResponse.json(
      { ok: false, baseUrl, model, error: ping.error },
      { status: 503 },
    );
  }

  const modelInstalled = modelIsInstalled(ping.models, model);
  return NextResponse.json({
    ok: true,
    baseUrl,
    model,
    modelInstalled,
    models: ping.models,
    hint: modelInstalled
      ? undefined
      : `Model "${model}" not found. Run: ollama pull ${model}`,
  });
}
