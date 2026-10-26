"use client";
import { useState } from "react";
import { Database, Download, HardDrive, Upload } from "lucide-react";
import { useWorkspace } from "../lib/workspace-context";
import { cloudStorageAvailable } from "../lib/storage-policy";
import { decryptBackup, encryptBackup } from "../lib/workspace-backup";
import type { LocalSnapshot } from "../lib/local-workspace";
import { Tile, buttonSecondary, inputClass } from "./ui";

export function StorageSettings() {
  const { storageMode, switchStorageMode, exportSnapshot, restoreSnapshot, ready } = useWorkspace();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<LocalSnapshot | null>(null);
  async function run(action: () => Promise<void>) {
    setBusy(true); setMessage(""); setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Storage operation failed."); } finally { setBusy(false); }
  }
  return <Tile span={6} title="Your data & backups" icon={<HardDrive size={16} />} description="Device storage is the default. Each account has a separate workspace in this browser.">
    <div className="flex flex-wrap items-start gap-5">
      <div className="min-w-0 flex-1 basis-72">
        <p className="text-sm font-medium">{storageMode === "local" ? "Stored on this device" : "Optional cloud workspace"}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">{storageMode === "local" ? "Profiles, documents, saved answers, job descriptions, and personal API keys stay in this browser. They are not automatically uploaded to our database." : "This workspace saves documents to the server. Personal API keys are kept on this device. Switching does not copy data between workspaces."}</p>
        <p className="mt-2 text-xs leading-relaxed text-muted">Generating with hosted AI sends the submitted content through the app server to your provider. PDF export also sends the document to the server. Browser storage is not an encrypted vault: keep backups and protect access to this device.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className={buttonSecondary} disabled={busy} onClick={() => void run(async () => {
            const granted = await navigator.storage?.persist?.();
            setMessage(granted ? "Persistent storage granted. Clearing site data still removes local workspaces." : "Your browser did not grant persistent storage. Keep an exported backup.");
          })}>Protect device storage</button>
          {cloudStorageAvailable && <button type="button" className={buttonSecondary} disabled={busy} onClick={() => {
            if (window.confirm("Open the separate " + (storageMode === "local" ? "cloud" : "device") + " workspace? Save your current edits first. This does not transfer or delete either workspace.")) switchStorageMode(storageMode === "local" ? "cloud" : "local");
          }}><Database size={14} />{storageMode === "local" ? "Open cloud workspace" : "Use device storage"}</button>}
        </div>
      </div>
      <div className="min-w-0 flex-1 basis-72">
        <label className="flex flex-col gap-2 text-xs font-medium">Backup passphrase<input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} className={inputClass} placeholder="At least 12 characters" /></label>
        <p className="mt-2 text-xs text-muted leading-relaxed">Encrypted on this device before download. API keys are excluded. Keep the passphrase separately; it cannot be recovered. Save your edits before exporting.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={buttonSecondary} disabled={!ready || busy} onClick={() => void run(async () => {
            const encrypted = await encryptBackup(await exportSnapshot(), password);
            const url = URL.createObjectURL(new Blob([encrypted], { type: "application/json" }));
            const link = document.createElement("a"); link.href = url; link.download = "resume-optimizer.encrypted.json"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
            setMessage("Encrypted backup downloaded. It contains your saved data, without API keys.");
          })}><Download size={14} />Export encrypted backup</button>
          <label className={`${buttonSecondary} cursor-pointer`}><Upload size={14} />Open backup<input aria-label="Open encrypted backup" type="file" accept=".json,application/json" disabled={busy} className="sr-only" onChange={e => {
            const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; setPending(null);
            void run(async () => { if (file.size > 12_000_000) throw new Error("Backup is too large (maximum 12 MB)."); setPending(await decryptBackup(await file.text(), password)); });
          }} /></label>
        </div>
        {pending && <div className="mt-4 rounded-md border border-border p-3 text-xs"><p>Backup ready: {pending.profile.name || "Unnamed profile"}, {pending.workspace.resumes.length} resumes, {pending.workspace.coverLetters.length} cover letters, {pending.workspace.applicationAnswerDocs.length} answers.</p><p className="mt-2 text-muted">Restoring replaces this account’s saved device workspace. Export your current data first.</p><button type="button" disabled={busy || storageMode !== "local"} className={`${buttonSecondary} mt-3`} onClick={() => void run(async () => { await restoreSnapshot(pending); setPending(null); setPassword(""); setMessage("Backup restored to this device."); })}>Restore to this device</button></div>}
      </div>
    </div>
    {busy && <p role="status" className="mt-3 text-xs text-muted">Processing on your device…</p>}
    {message && <p role="status" className="mt-3 text-xs text-success">{message}</p>}
    {error && <p role="alert" className="mt-3 text-xs text-danger">{error}</p>}
  </Tile>;
}
