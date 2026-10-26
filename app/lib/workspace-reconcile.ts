import type { WorkspacePatch, WorkspacePayload } from './document-schemas';

export const sameSnapshot = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Accept remote fields only when they have no newer local draft. */
export function reconcileWorkspace(current: WorkspacePayload, baseline: WorkspacePayload, remote: WorkspacePayload, sent?: WorkspacePatch): WorkspacePayload {
  return Object.fromEntries(Object.entries(remote).map(([field, value]) => {
    const key = field as keyof WorkspacePayload;
    const accepted = sameSnapshot(current[key], baseline[key]) ||
      (sent?.[key] !== undefined && sameSnapshot(current[key], sent[key]));
    return [key, accepted ? value : current[key]];
  })) as WorkspacePayload;
}
