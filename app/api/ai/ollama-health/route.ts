import { NextResponse } from "next/server";
import { currentUserId } from "@/auth";

import { getOllamaConfig } from "@/app/lib/ollama-config";
import { modelIsInstalled, pingOllama } from "@/app/lib/ollama-ping";

export const runtime = "nodejs";

/** Quick Ollama connectivity check (extension + settings UI). */
export async function GET(req: Request) {
  if (!(await currentUserId())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (process.env.ALLOW_OLLAMA === "false") return NextResponse.json({ error: "Ollama is disabled on this hosted deployment. Run the app locally to use device-local Ollama." }, { status: 403 });
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
