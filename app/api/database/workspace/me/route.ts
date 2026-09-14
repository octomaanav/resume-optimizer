import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { currentUserId } from "@/auth";
import { db, type DbOrTx } from "@/app/lib/db";
import { userWorkspace } from "@/app/lib/db/schema";
import {
  mergeWorkspacePatch,
  rowToWorkspacePayload,
  workspacePayloadToRow,
} from "@/app/lib/database/workspace-row";
import { WorkspacePatchSchema } from "@/app/lib/document-schemas";

export const runtime = "nodejs";

/** Reads the user's workspace row, creating an empty one on first access. */
async function loadOrCreateRow(client: DbOrTx, userId: string) {
  let row = await client.query.userWorkspace.findFirst({
    where: eq(userWorkspace.id, userId),
  });

  if (!row) {
    [row] = await client
      .insert(userWorkspace)
      .values({ id: userId })
      .onConflictDoNothing()
      .returning();

    row ??= await client.query.userWorkspace.findFirst({
      where: eq(userWorkspace.id, userId),
    });
  }

  return row ?? null;
}

/**
 * GET /api/database/workspace/me — settings, documents, optimizations JSON.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const row = await loadOrCreateRow(db, userId);
  if (!row) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 500 });
  }

  return NextResponse.json({ workspace: rowToWorkspacePayload(row) });
}

/**
 * PUT /api/database/workspace/me — partial patch; merged server-side.
 */
export async function PUT(request: Request) {
  const userId = await currentUserId();
  if (!userId) {
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
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Empty patch" }, { status: 400 });
  }

  // Read-modify-write must be one atomic unit: SELECT ... FOR UPDATE locks
  // the row for the transaction's lifetime, so a second concurrent PUT
  // blocks until this one commits, then merges on top of *our* result
  // instead of the same stale snapshot (otherwise the later write silently
  // discards the earlier one — each top-level key is a full replace).
  let merged;
  try {
    merged = await db.transaction(async (tx) => {
      await loadOrCreateRow(tx, userId);
      const [locked] = await tx
        .select()
        .from(userWorkspace)
        .where(eq(userWorkspace.id, userId))
        .for("update");
      if (!locked) throw new Error("Workspace read failed");

      const mergedPayload = mergeWorkspacePatch(
        rowToWorkspacePayload(locked),
        parsed.data,
      );
      const next = workspacePayloadToRow(userId, mergedPayload);

      await tx
        .insert(userWorkspace)
        .values(next)
        .onConflictDoUpdate({
          target: userWorkspace.id,
          set: { ...next, updatedAt: new Date() },
        });

      return mergedPayload;
    });
  } catch {
    return NextResponse.json(
      { error: "Workspace read failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ workspace: merged });
}
