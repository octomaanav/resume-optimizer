import { z } from "zod";
import { ProfileSchema, WorkspacePayloadSchema, defaultWorkspacePayload, type Profile, type WorkspacePatch, type WorkspacePayload } from "./document-schemas";
import { mergeWorkspacePatch } from "./database/workspace-row";

const SnapshotSchema = z.object({ version: z.literal(1), profile: ProfileSchema, workspace: WorkspacePayloadSchema });
export type LocalSnapshot = z.infer<typeof SnapshotSchema>;
export function emptyLocalSnapshot(): LocalSnapshot {
  return { version: 1, profile: ProfileSchema.parse({}), workspace: defaultWorkspacePayload() };
}
export function parseLocalSnapshot(value: unknown): LocalSnapshot { return SnapshotSchema.parse(value); }

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("resume-optimizer-private", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("workspaces");
    request.onerror = () => reject(new Error("Device storage could not be opened. Check browser storage permissions."));
    request.onblocked = () => reject(new Error("Close other app tabs to finish the device storage upgrade."));
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
  });
}

/** One read/write transaction prevents concurrent tabs from losing unrelated fields. */
async function access(owner: string, update?: (previous: LocalSnapshot) => LocalSnapshot): Promise<LocalSnapshot> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("workspaces", update ? "readwrite" : "readonly");
    const store = tx.objectStore("workspaces");
    const request = store.get(owner);
    let result: LocalSnapshot;
    request.onsuccess = () => {
      try {
        result = request.result === undefined ? emptyLocalSnapshot() : parseLocalSnapshot(request.result);
        if (update) { result = parseLocalSnapshot(update(result)); store.put(result, owner); }
      } catch { tx.abort(); }
    };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(new Error("Device storage failed. Your existing data was not replaced. Export a backup before clearing browser data.")); };
  });
}
export const readLocalWorkspace = (owner: string) => access(owner);
export const saveLocalProfile = (owner: string, profile: Profile) => access(owner, previous => ({ ...previous, profile }));
export const patchLocalWorkspace = (owner: string, patch: WorkspacePatch) => access(owner, previous => ({ ...previous, workspace: mergeWorkspacePatch(previous.workspace, patch) }));
export const replaceLocalWorkspace = (owner: string, snapshot: LocalSnapshot) => access(owner, () => snapshot);
export const saveDeviceSettings = (owner: string, settings: WorkspacePayload["settings"]) => patchLocalWorkspace(owner, {
  settings: { geminiApiKey: settings.geminiApiKey, groqApiKey: settings.groqApiKey },
});
