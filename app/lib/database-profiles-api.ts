import type { Profile } from "@/app/lib/profile-model";
import { isSupabaseConfigured } from "@/app/lib/supabase/public-env";

async function parseJsonError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string") return body.error;
    return JSON.stringify(body.error ?? res.statusText);
  } catch {
    return res.statusText;
  }
}

/** GET /api/database/profiles/me */
export async function fetchDatabaseProfile(): Promise<Profile> {
  const res = await fetch("/api/database/profiles/me", {
    credentials: "include",
    cache: "no-store",
  });
  if (res.status === 401) {
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    throw new Error(await parseJsonError(res));
  }
  const data = (await res.json()) as { profile: Profile };
  return data.profile;
}

/** PUT /api/database/profiles/me — body is full Profile or { profile }. */
export async function saveDatabaseProfile(
  profile: Profile,
): Promise<Profile> {
  const res = await fetch("/api/database/profiles/me", {
    method: "PUT",
    credentials: "include",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile }),
  });
  if (res.status === 401) {
    throw new Error("Unauthorized");
  }
  if (!res.ok) {
    throw new Error(await parseJsonError(res));
  }
  const data = (await res.json()) as { profile: Profile };
  return data.profile;
}

export type CloudProfileSyncResult =
  | { cloud: "ok" }
  | { cloud: "skipped" }
  | { cloud: "error"; message: string };

/**
 * Upsert profile to `public.profiles` when Supabase is configured and the user
 * has a session cookie. Guests / no env → skipped (no throw).
 */
export async function syncProfileToDatabaseIfSignedIn(
  profile: Profile,
): Promise<CloudProfileSyncResult> {
  if (!isSupabaseConfigured()) return { cloud: "skipped" };
  try {
    await saveDatabaseProfile(profile);
    return { cloud: "ok" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "Unauthorized") return { cloud: "skipped" };
    return { cloud: "error", message: msg };
  }
}
