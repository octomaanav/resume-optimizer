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

/**
 * Optimization records are keyed by base-document id and nothing ever
 * deletes an entry (a stale one is just orphaned when its base document is
 * removed), so it's safe — and necessary for correctness — to merge these
 * key-by-key instead of replacing the whole map. Two concurrent saves that
 * each touch a different base document's optimization (e.g. two tabs, or two
 * optimize pages open at once) would otherwise have one silently discard the
 * other's entry, since each PUT only knows about the optimization it just
 * computed, not ones saved elsewhere in the meantime.
 */
function mergeOptimizationMap<T>(
  base: Record<string, T>,
  patch: Record<string, T> | undefined,
): Record<string, T> {
  if (!patch) return base;
  return { ...base, ...patch };
}

export function mergeWorkspacePatch(
  base: WorkspacePayload,
  patch: WorkspacePatch,
): WorkspacePayload {
  return WorkspacePayloadSchema.parse({
    settings: patch.settings ?? base.settings,
    // Document lists are always sent in full (deleting one means the client
    // omits it), so these stay a full replace rather than a key-merge.
    resumes: patch.resumes ?? base.resumes,
    coverLetters: patch.coverLetters ?? base.coverLetters,
    applicationAnswerDocs:
      patch.applicationAnswerDocs ?? base.applicationAnswerDocs,
    resumeOptimizations: mergeOptimizationMap(
      base.resumeOptimizations,
      patch.resumeOptimizations,
    ),
    coverLetterOptimizations: mergeOptimizationMap(
      base.coverLetterOptimizations,
      patch.coverLetterOptimizations,
    ),
    applicationAnswerOptimizations: mergeOptimizationMap(
      base.applicationAnswerOptimizations,
      patch.applicationAnswerOptimizations,
    ),
  });
}
