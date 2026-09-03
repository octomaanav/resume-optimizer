import type { WorkspacePatch, WorkspacePayload } from "../document-schemas";
import type { Profile } from "../profile-model";
import type { ApplyFormField } from "./apply-form-store";

/** What a tool's execute() gets to read/write. Reads are live (ref-backed); writes go through the same workspace patch path the UI uses. */
export type WebMcpContext = {
  getProfile: () => Profile;
  getWorkspace: () => WorkspacePayload;
  patchWorkspace: (patch: WorkspacePatch) => Promise<void>;
  announcePdf: (title: string, url: string) => void;
  fillApplyField: (field: ApplyFormField, value: string) => void;
  submitApplyForm: () => { ok: true } | { ok: false; missing: ApplyFormField[] };
};

export type WebMcpToolDescriptor = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
  execute: (input: Record<string, unknown>, ctx: WebMcpContext) => Promise<string> | string;
};
