import {
  WorkspacePatchSchema,
  WorkspacePayloadSchema,
  type WorkspacePatch,
  type WorkspacePayload,
  defaultWorkspacePayload,
} from "@/app/lib/document-schemas";

async function parseJsonError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
    return JSON.stringify(body.error ?? res.statusText);
  } catch {
    return res.statusText;
  }
}

/** GET /api/database/workspace/me — guests get defaults (no throw). */
export async function fetchWorkspaceMe(): Promise<WorkspacePayload> {
  const res = await fetch("/api/database/workspace/me", {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401) {
    return defaultWorkspacePayload();
  }
  if (!res.ok) {
    throw new Error(await parseJsonError(res));
  }
  const data = (await res.json()) as { workspace: unknown };
  return WorkspacePayloadSchema.parse(data.workspace);
}

export async function patchWorkspaceMe(
  patch: WorkspacePatch,
): Promise<WorkspacePayload> {
  const body = WorkspacePatchSchema.parse(patch);
  const res = await fetch("/api/database/workspace/me", {
    method: "PUT",
    credentials: "include",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    throw new Error(await parseJsonError(res));
  }
  const data = (await res.json()) as { workspace: unknown };
  return WorkspacePayloadSchema.parse(data.workspace);
}
