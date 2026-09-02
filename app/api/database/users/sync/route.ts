import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";
import {
  type PublicUserRow,
  upsertPublicUserFromAuth,
} from "@/app/lib/database/users-row";

/**
 * POST /api/database/users/sync — upsert public.users from JWT / session.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error: upsertError } = await upsertPublicUserFromAuth(supabase, user);
  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const { data: row, error: selectError } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single<PublicUserRow>();

  if (selectError || !row) {
    return NextResponse.json(
      { error: selectError?.message ?? "Failed to load user row" },
      { status: 500 },
    );
  }

  return NextResponse.json(row);
}
