import { NextResponse } from "next/server";
import { createClient } from "@/app/lib/supabase/server";
import {
  ensureDefaultProfileRow,
  profileToRow,
  rowToProfile,
  type ProfilesTableRow,
} from "@/app/lib/database/profiles-row";
import { ProfileSchema } from "@/app/lib/profile-model";

/**
 * GET /api/database/profiles/me — full Profile JSON for the signed-in user.
 * Creates an empty profile row if none exists.
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

  const { error: ensureError } = await ensureDefaultProfileRow(
    supabase,
    user.id,
  );
  if (ensureError) {
    return NextResponse.json({ error: ensureError.message }, { status: 500 });
  }

  const { data: row, error: selectError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<ProfilesTableRow>();

  if (selectError || !row) {
    return NextResponse.json(
      { error: selectError?.message ?? "Profile not found" },
      { status: 500 },
    );
  }

  const profile = rowToProfile(row);
  return NextResponse.json({ profile });
}

/**
 * PUT /api/database/profiles/me — replace profile with validated body.
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

  const parsed = ProfileSchema.safeParse(
    body && typeof body === "object" && "profile" in body
      ? (body as { profile: unknown }).profile
      : body,
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const row = profileToRow(user.id, parsed.data);
  const { error: upsertError } = await supabase
    .from("profiles")
    .upsert(row, { onConflict: "id" });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ profile: parsed.data });
}
