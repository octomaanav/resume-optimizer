/**
 * Drizzle schema — local Postgres (see docker-compose.yml).
 *
 * Layout mirrors what the app already reads and writes:
 *  - Auth.js v5 tables (users / accounts / sessions / verification_tokens)
 *  - profiles      1:1 with users, mirrors ProfileSchema (app/lib/profile-model.ts)
 *  - user_workspace 1:1 with users, mirrors WorkspacePayload (app/lib/document-schemas.ts)
 *
 * Nested arrays stay JSONB so the Zod schemas remain the single source of truth
 * for their shape, exactly as they did under Supabase.
 */
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

/* ── Auth.js ──────────────────────────────────────────────────────────────── */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name"),
    email: text("email").unique(),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),
    /** bcrypt hash — null for OAuth-only accounts. */
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("users_email_idx").on(t.email)],
);

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerAccountId] }),
    index("accounts_user_id_idx").on(t.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    sessionToken: text("session_token").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* ── App data ─────────────────────────────────────────────────────────────── */

/** Resume/profile content, 1:1 with a user. Mirrors ProfileSchema. */
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  location: text("location").notNull().default(""),
  summary: text("summary").notNull().default(""),
  links: jsonb("links").notNull().default([]),
  skills: jsonb("skills").notNull().default([]),
  skillCategories: jsonb("skill_categories").notNull().default([]),
  experience: jsonb("experience").notNull().default([]),
  projects: jsonb("projects").notNull().default([]),
  education: jsonb("education").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * Documents, settings and optimization results, 1:1 with a user.
 * Q&A lives in application_answer_docs and is per-user by construction.
 */
export const userWorkspace = pgTable("user_workspace", {
  id: uuid("id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  settings: jsonb("settings").notNull().default({}),
  resumes: jsonb("resumes").notNull().default([]),
  coverLetters: jsonb("cover_letters").notNull().default([]),
  applicationAnswerDocs: jsonb("application_answer_docs")
    .notNull()
    .default([]),
  resumeOptimizations: jsonb("resume_optimizations").notNull().default({}),
  coverLetterOptimizations: jsonb("cover_letter_optimizations")
    .notNull()
    .default({}),
  applicationAnswerOptimizations: jsonb("application_answer_optimizations")
    .notNull()
    .default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;
export type WorkspaceRow = typeof userWorkspace.$inferSelect;
