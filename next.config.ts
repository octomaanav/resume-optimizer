import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

/**
 * Next.js only auto-loads `.env*` from the project root. Many editors put
 * `app/.env` next to the app folder; merge it so Supabase (and other) vars work.
 */
function parseDotEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) return {};
  const text = readFileSync(filePath, "utf8");
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || key.startsWith("#")) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function applyEnvRecord(record: Record<string, string>) {
  for (const [key, val] of Object.entries(record)) {
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

const appEnvPath = path.join(process.cwd(), "app", ".env");
const appEnv = parseDotEnvFile(appEnvPath);
applyEnvRecord(appEnv);

/** Dashboard / CLI often use unprefixed names; the browser needs NEXT_PUBLIC_*. */
function ensureSupabasePublicEnv() {
  const pick = (k: string) => process.env[k]?.trim() || appEnv[k]?.trim();
  if (!pick("NEXT_PUBLIC_SUPABASE_URL")) {
    const u = pick("SUPABASE_URL");
    if (u) process.env.NEXT_PUBLIC_SUPABASE_URL = u;
  }
  if (!pick("NEXT_PUBLIC_SUPABASE_ANON_KEY")) {
    const k = pick("SUPABASE_ANON_KEY") || pick("SUPABASE_KEY");
    if (k) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = k;
  }
}

ensureSupabasePublicEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-latex-compiler"],
  /**
   * Ensures Turbopack/webpack inline these into client bundles. Relying only on
   * mutating `process.env` in this file is not always enough for the browser.
   */
  env: {
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
  },
};

export default nextConfig;
