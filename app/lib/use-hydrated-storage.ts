"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  ApplicationAnswerDoc,
  CoverLetterDoc,
  Profile,
  ResumeDoc,
  Settings,
} from "./document-schemas";
import { useWorkspace } from "./workspace-context";

export function useHasMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

export function useHydratedProfile(): [
  Profile,
  Dispatch<SetStateAction<Profile>>,
  boolean,
] {
  const { profile, setProfile, ready } = useWorkspace();
  return [profile, setProfile, ready];
}

export function useHydratedResumes(): [
  ResumeDoc[],
  Dispatch<SetStateAction<ResumeDoc[]>>,
  boolean,
  (next: ResumeDoc[]) => Promise<void>,
] {
  const { workspace, setWorkspace, ready, patchWorkspace } = useWorkspace();
  const setDocs = useCallback(
    (action: SetStateAction<ResumeDoc[]>) => {
      setWorkspace((w) => ({
        ...w,
        resumes: typeof action === "function" ? action(w.resumes) : action,
      }));
    },
    [setWorkspace],
  );
  const persist = useCallback(
    (next: ResumeDoc[]) => patchWorkspace({ resumes: next }),
    [patchWorkspace],
  );
  return [workspace.resumes, setDocs, ready, persist];
}

export function useHydratedCoverLetters(): [
  CoverLetterDoc[],
  Dispatch<SetStateAction<CoverLetterDoc[]>>,
  boolean,
  (next: CoverLetterDoc[]) => Promise<void>,
] {
  const { workspace, setWorkspace, ready, patchWorkspace } = useWorkspace();
  const setDocs = useCallback(
    (action: SetStateAction<CoverLetterDoc[]>) => {
      setWorkspace((w) => ({
        ...w,
        coverLetters: typeof action === "function" ? action(w.coverLetters) : action,
      }));
    },
    [setWorkspace],
  );
  const persist = useCallback(
    (next: CoverLetterDoc[]) => patchWorkspace({ coverLetters: next }),
    [patchWorkspace],
  );
  return [workspace.coverLetters, setDocs, ready, persist];
}

export function useHydratedSettings(): [
  Settings,
  Dispatch<SetStateAction<Settings>>,
  boolean,
  (next: Settings) => Promise<void>,
] {
  const { workspace, setWorkspace, ready, patchWorkspace } = useWorkspace();
  const setSettings = useCallback(
    (action: SetStateAction<Settings>) => {
      setWorkspace((w) => ({
        ...w,
        settings: typeof action === "function" ? action(w.settings) : action,
      }));
    },
    [setWorkspace],
  );
  const persist = useCallback(
    (next: Settings) => patchWorkspace({ settings: next }),
    [patchWorkspace],
  );
  return [workspace.settings, setSettings, ready, persist];
}

export function useHydratedApplicationAnswerDocs(): [
  ApplicationAnswerDoc[],
  Dispatch<SetStateAction<ApplicationAnswerDoc[]>>,
  boolean,
  (next: ApplicationAnswerDoc[]) => Promise<void>,
] {
  const { workspace, setWorkspace, ready, patchWorkspace } = useWorkspace();
  const setDocs = useCallback(
    (action: SetStateAction<ApplicationAnswerDoc[]>) => {
      setWorkspace((w) => ({
        ...w,
        applicationAnswerDocs:
          typeof action === "function"
            ? action(w.applicationAnswerDocs)
            : action,
      }));
    },
    [setWorkspace],
  );
  const persist = useCallback(
    (next: ApplicationAnswerDoc[]) =>
      patchWorkspace({ applicationAnswerDocs: next }),
    [patchWorkspace],
  );
  return [workspace.applicationAnswerDocs, setDocs, ready, persist];
}

/** Resume / cover / app-answer optimizations (maps by base doc id). */
export function useWorkspaceOptimizations() {
  const { workspace, patchWorkspace, ready } = useWorkspace();
  return useMemo(
    () => ({
      ready,
      resumeOptimizations: workspace.resumeOptimizations,
      coverLetterOptimizations: workspace.coverLetterOptimizations,
      applicationAnswerOptimizations: workspace.applicationAnswerOptimizations,
      patchResumeOptimizations: (m: typeof workspace.resumeOptimizations) =>
        patchWorkspace({ resumeOptimizations: m }),
      patchCoverLetterOptimizations: (
        m: typeof workspace.coverLetterOptimizations,
      ) => patchWorkspace({ coverLetterOptimizations: m }),
      patchApplicationAnswerOptimizations: (
        m: typeof workspace.applicationAnswerOptimizations,
      ) => patchWorkspace({ applicationAnswerOptimizations: m }),
    }),
    [workspace, patchWorkspace, ready],
  );
}
