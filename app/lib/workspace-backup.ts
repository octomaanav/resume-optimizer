import { z } from "zod";
import { parseLocalSnapshot, type LocalSnapshot } from "./local-workspace";
import { withoutApiKeys } from "./storage-policy";

const Envelope = z.object({ format: z.literal("resume-optimizer-backup"), version: z.literal(1), salt: z.string().max(32), iv: z.string().max(24), ciphertext: z.string().max(12_000_000) }).strict();
const encode = (bytes: Uint8Array) => { let text = ""; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text); };
const decode = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
async function backupKey(password: string, salt: Uint8Array<ArrayBuffer>) {
  if (password.length < 12) throw new Error("Use a backup passphrase of at least 12 characters.");
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", iterations: 600_000, salt }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export async function encryptBackup(snapshot: LocalSnapshot, password: string): Promise<string> {
  const clean = parseLocalSnapshot(snapshot);
  clean.workspace.settings = withoutApiKeys(clean.workspace.settings);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await backupKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(clean)));
  return JSON.stringify({ format: "resume-optimizer-backup", version: 1, salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) });
}
export async function decryptBackup(text: string, password: string): Promise<LocalSnapshot> {
  try {
    if (text.length > 12_000_000) throw new Error();
    const input = Envelope.parse(JSON.parse(text));
    const salt = decode(input.salt), iv = decode(input.iv);
    if (salt.length !== 16 || iv.length !== 12) throw new Error();
    const key = await backupKey(password, salt);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, decode(input.ciphertext));
    const result = parseLocalSnapshot(JSON.parse(new TextDecoder().decode(decrypted)));
    result.workspace.settings = withoutApiKeys(result.workspace.settings);
    return result;
  } catch { throw new Error("Could not open backup. Check the passphrase and file. No data was changed."); }
}
