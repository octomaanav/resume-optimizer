import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PublicUserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export function publicUserRowFromAuth(user: User) {
  const meta = user.user_metadata ?? {};
  const fullName =
    typeof meta.full_name === "string"
      ? meta.full_name
      : typeof meta.name === "string"
        ? meta.name
        : null;
  const avatarUrl =
    typeof meta.avatar_url === "string" ? meta.avatar_url : null;

  return {
    id: user.id,
    email: user.email ?? null,
    full_name: fullName,
    avatar_url: avatarUrl,
  };
}

/**
 * Insert or update public.users from the current auth user (respects RLS).
 */
export async function upsertPublicUserFromAuth(
  supabase: SupabaseClient,
  user: User,
): Promise<{ error: Error | null }> {
  const row = publicUserRowFromAuth(user);
  const { error } = await supabase.from("users").upsert(row, {
    onConflict: "id",
  });
  return { error: error ? new Error(error.message) : null };
}
