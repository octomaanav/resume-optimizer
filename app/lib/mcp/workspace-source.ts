/**
 * workspace-source.ts — resolves the caller's profile + workspace for MCP tools.
 *
 * MCP requests arrive from Claude/ChatGPT with no browser cookies, so the
 * cookie-based Supabase client in app/lib/supabase/server.ts cannot be used.
 * Two strategies, tried in order:
 *
 *   1. Snapshot file (default, zero setup) — the signed-in browser POSTs its
 *      workspace to /api/mcp/snapshot, which writes .mcp-workspace.json.
 *   2. Supabase service role — set SUPABASE_SERVICE_ROLE_KEY + MCP_USER_ID to
 *      read user_workspace / profiles directly, no snapshot needed.
 */

import { promises as fs } from "fs";
import path from "path";

import {
  WorkspacePayloadSchema,
  defaultWorkspacePayload,
  type WorkspacePayload,
} from "@/app/lib/document-schemas";
import { ProfileSchema, emptyProfile, type Profile } from "@/app/lib/profile-model";
import {
  rowToWorkspacePayload,
  type UserWorkspaceRow,
} from "@/app/lib/database/workspace-row";
import { rowToProfile, type ProfilesTableRow } from "@/app/lib/database/profiles-row";

export type McpWorkspace = {
  profile: Profile;
  workspace: WorkspacePayload;
  source: "snapshot" | "supabase" | "empty";
};

const SNAPSHOT_PATH = path.join(process.cwd(), ".mcp-workspace.json");

/** Tolerates partial/absent workspaces so a snapshot can be seeded by hand. */
function coerceWorkspace(raw: unknown): WorkspacePayload {
  const base = defaultWorkspacePayload();
  if (!raw || typeof raw !== "object") return base;
  return WorkspacePayloadSchema.parse({ ...base, ...(raw as object) });
}

export async function writeSnapshot(payload: {
  profile: unknown;
  workspace: unknown;
}): Promise<void> {
  const body = {
    profile: ProfileSchema.parse(payload.profile ?? {}),
    workspace: coerceWorkspace(payload.workspace),
    updatedAt: Date.now(),
  };
  await fs.writeFile(SNAPSHOT_PATH, JSON.stringify(body, null, 2), "utf8");
}

async function readSnapshot(): Promise<McpWorkspace | null> {
  try {
    const raw = await fs.readFile(SNAPSHOT_PATH, "utf8");
    const parsed = JSON.parse(raw) as { profile?: unknown; workspace?: unknown };
    return {
      profile: ProfileSchema.parse(parsed.profile ?? {}),
      workspace: coerceWorkspace(parsed.workspace),
      source: "snapshot",
    };
  } catch {
    return null;
  }
}

async function readViaServiceRole(): Promise<McpWorkspace | null> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const userId = process.env.MCP_USER_ID?.trim();
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
    process.env.SUPABASE_URL?.trim();
  if (!key || !userId || !url) return null;

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Both tables store their payloads as separate typed columns, NOT as a single
  // JSON blob — select("*") and reuse the same row mappers the API routes use.
  const [wsRes, profRes] = await Promise.all([
    admin.from("user_workspace").select("*").eq("id", userId).maybeSingle(),
    admin.from("profiles").select("*").eq("id", userId).maybeSingle(),
  ]);

  // A half-failed read would silently produce an empty profile, which reads as
  // "user has no experience" rather than as an error. Fall through instead.
  if (wsRes.error || profRes.error || (!wsRes.data && !profRes.data)) return null;

  return {
    profile: profRes.data
      ? rowToProfile(profRes.data as ProfilesTableRow)
      : emptyProfile(),
    workspace: wsRes.data
      ? rowToWorkspacePayload(wsRes.data as UserWorkspaceRow)
      : defaultWorkspacePayload(),
    source: "supabase",
  };
}

/** Never throws — tools surface a clear "run the sync" message instead. */
export async function loadWorkspace(): Promise<McpWorkspace> {
  return (
    (await readViaServiceRole()) ??
    (await readSnapshot()) ?? {
      profile: emptyProfile(),
      workspace: defaultWorkspacePayload(),
      source: "empty",
    }
  );
}

export const NO_PROFILE_HINT =
  "No profile is available to the MCP server yet. Open the app at /settings while " +
  "signed in and click \"Sync to MCP\", or POST your workspace to /api/mcp/snapshot. " +
  "Alternatively set SUPABASE_SERVICE_ROLE_KEY and MCP_USER_ID in .env.local.";
