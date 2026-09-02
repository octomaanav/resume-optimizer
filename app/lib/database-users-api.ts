import type { PublicUserRow } from "@/app/lib/database/users-row";

async function parseJsonError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

/** GET /api/database/users/me */
export async function fetchDatabaseUserMe(): Promise<PublicUserRow> {
  const res = await fetch("/api/database/users/me", {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401) {
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    throw new Error(await parseJsonError(res));
  }
  return (await res.json()) as PublicUserRow;
}

/** POST /api/database/users/sync */
export async function syncDatabaseUser(): Promise<PublicUserRow> {
  const res = await fetch("/api/database/users/sync", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401) {
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    throw new Error(await parseJsonError(res));
  }
  return (await res.json()) as PublicUserRow;
}
