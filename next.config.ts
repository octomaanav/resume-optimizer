import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

/**
 * Next.js only auto-loads `.env*` from the project root. Some editors put
 * `app/.env` next to the app folder; merge it so those vars still work.
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

applyEnvRecord(parseDotEnvFile(path.join(process.cwd(), "app", ".env")));

const nextConfig: NextConfig = {
  serverExternalPackages: ["node-latex-compiler", "postgres", "bcryptjs"],
};

export default nextConfig;
