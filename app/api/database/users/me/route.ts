import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";
import {
  type PublicUserRow,
  upsertPublicUserFromAuth,
} from "@/app/lib/database/users-row";

/**
 * GET /api/database/users/me — current session’s row in public.users.
 * Creates the row from auth metadata if missing.
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

  const { data: row, error: selectError } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<PublicUserRow>();

  if (selectError) {
    return NextResponse.json(
      { error: selectError.message },
      { status: 500 },
    );
  }

  if (!row) {
    const { error: upsertError } = await upsertPublicUserFromAuth(
      supabase,
      user,
    );
    if (upsertError) {
      return NextResponse.json({ error: upsertError.message }, { status: 500 });
    }
    const { data: created, error: again } = await supabase
      .from("users")
      .select("*")
      .eq("id", user.id)
      .single<PublicUserRow>();
    if (again || !created) {
      return NextResponse.json(
        { error: again?.message ?? "Failed to load user row" },
        { status: 500 },
      );
    }
    return NextResponse.json(created);
  }

  return NextResponse.json(row);
}
