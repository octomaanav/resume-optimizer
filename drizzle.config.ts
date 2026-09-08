import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./app/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://resume:resume_local_dev@localhost:5433/resume_optimizer",
  },
  verbose: true,
  strict: true,
});
