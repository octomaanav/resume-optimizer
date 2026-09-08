import {
  WorkspacePayloadSchema,
  type WorkspacePayload,
  type WorkspacePatch,
} from "@/app/lib/document-schemas";
import type { WorkspaceRow } from "@/app/lib/db/schema";

/** Row → validated WorkspacePayload. Keys match the Drizzle schema. */
export function rowToWorkspacePayload(row: WorkspaceRow): WorkspacePayload {
  return WorkspacePayloadSchema.parse({
    settings: row.settings ?? {},
    resumes: row.resumes ?? [],
    coverLetters: row.coverLetters ?? [],
    applicationAnswerDocs: row.applicationAnswerDocs ?? [],
    resumeOptimizations: row.resumeOptimizations ?? {},
    coverLetterOptimizations: row.coverLetterOptimizations ?? {},
    applicationAnswerOptimizations: row.applicationAnswerOptimizations ?? {},
  });
}

/** WorkspacePayload → row values for insert/update. */
export function workspacePayloadToRow(userId: string, w: WorkspacePayload) {
  return {
    id: userId,
    settings: w.settings,
    resumes: w.resumes,
    coverLetters: w.coverLetters,
    applicationAnswerDocs: w.applicationAnswerDocs,
    resumeOptimizations: w.resumeOptimizations,
    coverLetterOptimizations: w.coverLetterOptimizations,
    applicationAnswerOptimizations: w.applicationAnswerOptimizations,
  };
}

export function mergeWorkspacePatch(
  base: WorkspacePayload,
  patch: WorkspacePatch,
): WorkspacePayload {
  return WorkspacePayloadSchema.parse({
    settings: patch.settings ?? base.settings,
    resumes: patch.resumes ?? base.resumes,
    coverLetters: patch.coverLetters ?? base.coverLetters,
    applicationAnswerDocs:
      patch.applicationAnswerDocs ?? base.applicationAnswerDocs,
    resumeOptimizations:
      patch.resumeOptimizations ?? base.resumeOptimizations,
    coverLetterOptimizations:
      patch.coverLetterOptimizations ?? base.coverLetterOptimizations,
    applicationAnswerOptimizations:
      patch.applicationAnswerOptimizations ??
      base.applicationAnswerOptimizations,
  });
}
