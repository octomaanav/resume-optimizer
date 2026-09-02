"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { saveDatabaseProfile } from "@/app/lib/database-profiles-api";
import { fetchDatabaseProfile } from "@/app/lib/database-profiles-api";
import {
  defaultWorkspacePayload,
  type WorkspacePatch,
  type WorkspacePayload,
} from "@/app/lib/document-schemas";
import {
  ProfileSchema,
  migrateLegacyProfileSkills,
  type Profile,
} from "@/app/lib/profile-model";
import { fetchWorkspaceMe, patchWorkspaceMe } from "@/app/lib/workspace-api";

type WorkspaceContextValue = {
  ready: boolean;
  loadError: string | null;
  workspace: WorkspacePayload;
  setWorkspace: Dispatch<SetStateAction<WorkspacePayload>>;
  patchWorkspace: (p: WorkspacePatch) => Promise<void>;
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
  saveProfileToCloud: (p: Profile) => Promise<void>;
  refresh: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(() =>
    ProfileSchema.parse({}),
  );
  const [workspace, setWorkspace] = useState<WorkspacePayload>(() =>
    defaultWorkspacePayload(),
  );

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [ws, prof] = await Promise.all([
        fetchWorkspaceMe(),
        fetchDatabaseProfile().catch(() => ProfileSchema.parse({})),
      ]);
      setWorkspace(ws);
      setProfile(migrateLegacyProfileSkills(prof));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load workspace");
    } finally {
      setReady(true);
    }
  }, []);

  // Initial load
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Re-fetch whenever the tab becomes visible again so changes made from the
  // Chrome extension (or another tab) are reflected without a manual page refresh.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [refresh]);

  const patchWorkspace = useCallback(async (p: WorkspacePatch) => {
    const next = await patchWorkspaceMe(p);
    setWorkspace(next);
  }, []);

  const saveProfileToCloud = useCallback(async (p: Profile) => {
    const parsed = migrateLegacyProfileSkills(ProfileSchema.parse(p));
    await saveDatabaseProfile(parsed);
    setProfile(parsed);
  }, []);

  const value = useMemo(
    (): WorkspaceContextValue => ({
      ready,
      loadError,
      workspace,
      setWorkspace,
      patchWorkspace,
      profile,
      setProfile,
      saveProfileToCloud,
      refresh,
    }),
    [
      ready,
      loadError,
      workspace,
      patchWorkspace,
      profile,
      saveProfileToCloud,
      refresh,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return ctx;
}
