/**
 * POST /api/auth/register — manual email/password sign-up.
 *
 * OAuth sign-ups go through Auth.js and the Drizzle adapter; this route only
 * covers the credentials path, which the adapter does not handle itself.
 */
import { hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/app/lib/db";
import { users } from "@/app/lib/db/schema";

export const runtime = "nodejs";

const BodySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().email(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(200),
});

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input." },
      { status: 400 },
    );
  }

  const email = parsed.data.email.toLowerCase();

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 },
    );
  }

  const passwordHash = await hash(parsed.data.password, 12);

  const [created] = await db
    .insert(users)
    .values({
      email,
      name: parsed.data.name ?? null,
      passwordHash,
    })
    .returning({ id: users.id, email: users.email });

  return NextResponse.json({ ok: true, user: created }, { status: 201 });
}
