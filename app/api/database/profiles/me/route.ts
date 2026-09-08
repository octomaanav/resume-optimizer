import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { currentUserId } from "@/auth";
import { db } from "@/app/lib/db";
import { profiles } from "@/app/lib/db/schema";
import { profileToRow, rowToProfile } from "@/app/lib/database/profiles-row";
import { ProfileSchema } from "@/app/lib/profile-model";

export const runtime = "nodejs";

/**
 * GET /api/database/profiles/me — full Profile JSON for the signed-in user.
 * Creates an empty profile row if none exists.
 */
export async function GET() {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let row = await db.query.profiles.findFirst({
    where: eq(profiles.id, userId),
  });

  if (!row) {
    [row] = await db
      .insert(profiles)
      .values({ id: userId })
      .onConflictDoNothing()
      .returning();

    // A concurrent request may have inserted it first.
    row ??= await db.query.profiles.findFirst({
      where: eq(profiles.id, userId),
    });
  }

  if (!row) {
    return NextResponse.json(
      { error: "Profile could not be created" },
      { status: 500 },
    );
  }

  return NextResponse.json({ profile: rowToProfile(row) });
}

/**
 * PUT /api/database/profiles/me — replace profile with validated body.
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

  const parsed = ProfileSchema.safeParse(
    body && typeof body === "object" && "profile" in body
      ? (body as { profile: unknown }).profile
      : body,
  );
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const row = profileToRow(userId, parsed.data);

  await db
    .insert(profiles)
    .values(row)
    .onConflictDoUpdate({
      target: profiles.id,
      set: { ...row, updatedAt: new Date() },
    });

  return NextResponse.json({ profile: parsed.data });
}
