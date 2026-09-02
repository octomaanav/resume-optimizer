import { NextResponse } from "next/server";
import { WorkspacePatchSchema } from "@/app/lib/document-schemas";
import { defaultWorkspacePayload } from "@/app/lib/document-schemas";
import {
  mergeWorkspacePatch,
  rowToWorkspacePayload,
  workspacePayloadToRow,
  type UserWorkspaceRow,
} from "@/app/lib/database/workspace-row";
import { createClient } from "@/app/lib/supabase/server";

async function ensureWorkspaceRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data: existing } = await supabase
    .from("user_workspace")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (existing) return;

  await supabase
    .from("user_workspace")
    .insert(workspacePayloadToRow(userId, defaultWorkspacePayload()));
}

/**
 * GET /api/database/workspace/me — settings, documents, optimizations JSON.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureWorkspaceRow(supabase, user.id);

  const { data: row, error } = await supabase
    .from("user_workspace")
    .select("*")
    .eq("id", user.id)
    .single<UserWorkspaceRow>();

  if (error || !row) {
    return NextResponse.json(
      { error: error?.message ?? "Workspace not found" },
      { status: 500 },
    );
  }

  const workspace = rowToWorkspacePayload(row);
  return NextResponse.json({ workspace });
}

/**
 * PUT /api/database/workspace/me — partial patch; merged server-side.
 */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = WorkspacePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: "Empty patch" },
      { status: 400 },
    );
  }

  await ensureWorkspaceRow(supabase, user.id);

  const { data: row, error: readError } = await supabase
    .from("user_workspace")
    .select("*")
    .eq("id", user.id)
    .single<UserWorkspaceRow>();

  if (readError || !row) {
    return NextResponse.json(
      { error: readError?.message ?? "Workspace read failed" },
      { status: 500 },
    );
  }

  const current = rowToWorkspacePayload(row);
  const merged = mergeWorkspacePatch(current, parsed.data);
  const upsertRow = workspacePayloadToRow(user.id, merged);

  const { error: upsertError } = await supabase
    .from("user_workspace")
    .upsert(upsertRow, { onConflict: "id" });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ workspace: merged });
}
