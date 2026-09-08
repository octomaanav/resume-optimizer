/**
 * Drizzle client for the local Postgres instance (docker-compose.yml).
 *
 * The connection is cached on globalThis so Next.js hot reloads in dev don't
 * open a new pool on every recompile.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and run `npm run db:up`.",
  );
}

const globalForDb = globalThis as unknown as {
  __resumeOptimizerSql?: ReturnType<typeof postgres>;
};

const sql =
  globalForDb.__resumeOptimizerSql ??
  postgres(connectionString, { max: 10, prepare: false });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__resumeOptimizerSql = sql;
}

export const db = drizzle(sql, { schema });
export { schema };
