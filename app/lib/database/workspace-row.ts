import {
  WorkspacePayloadSchema,
  type WorkspacePayload,
  type WorkspacePatch,
} from "@/app/lib/document-schemas";

export type UserWorkspaceRow = {
  id: string;
  settings: unknown;
  resumes: unknown;
  cover_letters: unknown;
  application_answer_docs: unknown;
  resume_optimizations: unknown;
  cover_letter_optimizations: unknown;
  application_answer_optimizations: unknown;
};

export function rowToWorkspacePayload(row: UserWorkspaceRow): WorkspacePayload {
  return WorkspacePayloadSchema.parse({
    settings: row.settings ?? {},
    resumes: row.resumes ?? [],
    coverLetters: row.cover_letters ?? [],
    applicationAnswerDocs: row.application_answer_docs ?? [],
    resumeOptimizations: row.resume_optimizations ?? {},
    coverLetterOptimizations: row.cover_letter_optimizations ?? {},
    applicationAnswerOptimizations: row.application_answer_optimizations ?? {},
  });
}

export function workspacePayloadToRow(
  userId: string,
  w: WorkspacePayload,
): Omit<UserWorkspaceRow, "id"> & { id: string } {
  return {
    id: userId,
    settings: w.settings,
    resumes: w.resumes,
    cover_letters: w.coverLetters,
    application_answer_docs: w.applicationAnswerDocs,
    resume_optimizations: w.resumeOptimizations,
    cover_letter_optimizations: w.coverLetterOptimizations,
    application_answer_optimizations: w.applicationAnswerOptimizations,
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
