/**
 * /api/mcp/snapshot — hands the MCP server a copy of the user's workspace.
 *
 * MCP calls arrive from Claude/ChatGPT with no browser cookies, so the server
 * cannot read the signed-in user's data the usual way. The browser (which does
 * have the session) POSTs its workspace here once; MCP tools read it after.
 *
 * Not needed if SUPABASE_SERVICE_ROLE_KEY + MCP_USER_ID are set.
 */

import { NextResponse } from "next/server";

import { loadWorkspace, writeSnapshot } from "@/app/lib/mcp/workspace-source";

export const runtime = "nodejs";

function authorized(req: Request): boolean {
  const expected = process.env.MCP_AUTH_TOKEN?.trim();
  if (!expected) return true; // dev: same policy as /api/mcp on localhost
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  return token === expected;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Invalid Bearer token" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { profile, workspace } = (body ?? {}) as {
    profile?: unknown;
    workspace?: unknown;
  };

  try {
    await writeSnapshot({ profile, workspace });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Snapshot write failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** Confirms what the MCP tools can currently see. */
export async function GET() {
  const { profile, workspace, source } = await loadWorkspace();
  return NextResponse.json({
    source,
    profileName: profile.name,
    experienceCount: profile.experience.length,
    projectCount: profile.projects.length,
    resumeCount: workspace.resumes.length,
    aiProvider: workspace.settings.aiProvider,
    // Named explicitly: a stale or retired model here fails every generation
    // tool, and the error surfaces far from the setting that caused it.
    model:
      workspace.settings.aiProvider === "ollama"
        ? workspace.settings.ollamaModel
        : "gemini (server-side model ladder)",
    hasGeminiKey: Boolean(workspace.settings.geminiApiKey?.trim()),
  });
}
