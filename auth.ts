/**
 * Auth.js v5 — Google + GitHub OAuth and email/password credentials,
 * all backed by the local Postgres instance via Drizzle.
 *
 * Session strategy is JWT: the Credentials provider cannot use database
 * sessions in Auth.js v5. The Drizzle adapter still persists users and linked
 * OAuth accounts, so `session.user.id` is a real users.id in every case.
 */
import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { z } from "zod";

import { db } from "@/app/lib/db";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@/app/lib/db/schema";

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

/** Providers are only offered when their env vars are actually configured. */
const oauthProviders = [
  ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
    ? [
        Google({
          clientId: process.env.AUTH_GOOGLE_ID,
          clientSecret: process.env.AUTH_GOOGLE_SECRET,
          allowDangerousEmailAccountLinking: true,
        }),
      ]
    : []),
  ...(process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET
    ? [
        GitHub({
          clientId: process.env.AUTH_GITHUB_ID,
          clientSecret: process.env.AUTH_GITHUB_SECRET,
          allowDangerousEmailAccountLinking: true,
        }),
      ]
    : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    ...oauthProviders,
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = CredentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const row = await db.query.users.findFirst({
          where: eq(users.email, email.toLowerCase()),
        });

        // No row, or an OAuth-only account with no password set.
        if (!row?.passwordHash) return null;

        const valid = await compare(password, row.passwordHash);
        if (!valid) return null;

        return {
          id: row.id,
          email: row.email,
          name: row.name,
          image: row.image,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

/** Returns the signed-in user's id, or null. Use in route handlers. */
export async function currentUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
