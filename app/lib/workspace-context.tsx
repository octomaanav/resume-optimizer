"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useSession } from "next-auth/react";
import { defaultStorageMode, cloudStorageAvailable, withoutApiKeys, type StorageMode } from "./storage-policy";
import { readLocalWorkspace, saveLocalProfile, patchLocalWorkspace, replaceLocalWorkspace, parseLocalSnapshot, saveDeviceSettings, type LocalSnapshot } from "./local-workspace";
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
import { reconcileWorkspace, sameSnapshot } from "./workspace-reconcile";
import { fetchWorkspaceMe, patchWorkspaceMe } from "@/app/lib/workspace-api";

type WorkspaceContextValue = {
  storageMode: StorageMode;
  switchStorageMode: (mode: StorageMode) => void;
  exportSnapshot: () => Promise<LocalSnapshot>;
  restoreSnapshot: (snapshot: unknown) => Promise<void>;
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
  const { data: session, status } = useSession();
  const owner = session?.user?.id ?? "guest";
  if (status === "loading") return <p role="status" className="p-6 text-sm text-muted">Opening your workspace…</p>;
  return <OwnedWorkspace key={owner} owner={owner}>{children}</OwnedWorkspace>;
}

function OwnedWorkspace({ children, owner }: { children: ReactNode; owner: string }) {
  const [storageMode, setStorageMode] = useState<StorageMode>(defaultStorageMode);
  const modeInitialized = useRef(false);
  const modeRevision = useRef(0);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile>(() =>
    ProfileSchema.parse({}),
  );
  const [workspace, setWorkspace] = useState<WorkspacePayload>(() =>
    defaultWorkspacePayload(),
  );

  const profileBaseline = useRef(ProfileSchema.parse({}));
  const workspaceBaseline = useRef(defaultWorkspacePayload());
  const refreshVersion = useRef(0);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    const oldProfile = profileBaseline.current;
    const oldWorkspace = workspaceBaseline.current;
    try {
      if (!modeInitialized.current) {
        const preference = localStorage.getItem(`resume-storage-mode:${owner}`);
        const initial = preference === "local" ? "local" : preference === "cloud" && cloudStorageAvailable ? "cloud" : defaultStorageMode();
        modeInitialized.current = true;
        if (initial !== storageMode) { ++refreshVersion.current; setStorageMode(initial); return; }
      }
      localStorage.setItem(`resume-storage-mode:${owner}`, storageMode);
      let ws: WorkspacePayload;
      let prof: Profile;
      if (storageMode === "local") {
        const snapshot = await readLocalWorkspace(owner);
        ws = snapshot.workspace; prof = snapshot.profile;
      } else {
      [ws, prof] = await Promise.all([
        fetchWorkspaceMe(),
        fetchDatabaseProfile().catch(error => {
          if (error instanceof Error && error.message === "Unauthorized") return ProfileSchema.parse({});
          throw error;
        }),
      ]);
      const device = await readLocalWorkspace(owner);
      ws.settings = { ...ws.settings, geminiApiKey: device.workspace.settings.geminiApiKey, groqApiKey: device.workspace.settings.groqApiKey };
      }
      if (version !== refreshVersion.current) return;
      setLoadError(null);
      const nextProfile = migrateLegacyProfileSkills(prof);
      setWorkspace(current => reconcileWorkspace(current, oldWorkspace, ws));
      setProfile(current => sameSnapshot(current, oldProfile) ? nextProfile : current);
      workspaceBaseline.current = ws;
      profileBaseline.current = nextProfile;
    } catch (e) {
      if (version === refreshVersion.current) setLoadError(e instanceof Error ? e.message : "Failed to load workspace");
    } finally {
      if (version === refreshVersion.current) setReady(true);
    }
  }, [owner, storageMode]);

  // Initial load
  useEffect(() => {
    // Storage preferences and IndexedDB are browser-owned external state.
    let active = true;
    queueMicrotask(() => { if (active) void refresh(); });
    return () => { active = false; };
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

  const patchWorkspace = useCallback((p: WorkspacePatch) => {
    const revision = modeRevision.current;
    const task = saveQueue.current.catch(() => {}).then(async () => {
      const previous = workspaceBaseline.current;
      let next: WorkspacePayload;
      if (storageMode === "local") {
        next = (await patchLocalWorkspace(owner, p)).workspace;
      } else {
        if (p.settings) await saveDeviceSettings(owner, { ...workspaceBaseline.current.settings, ...p.settings });
        const cloudPatch = p.settings ? { ...p, settings: withoutApiKeys(p.settings) } : p;
        next = await patchWorkspaceMe(cloudPatch);
        const device = await readLocalWorkspace(owner);
        next.settings = { ...next.settings, geminiApiKey: device.workspace.settings.geminiApiKey, groqApiKey: device.workspace.settings.groqApiKey };
      }
      if (revision !== modeRevision.current) return;
      ++refreshVersion.current; // Ignore refreshes that began before this save.
      setWorkspace(current => reconcileWorkspace(current, previous, next, p));
      workspaceBaseline.current = next;
    });
    saveQueue.current = task;
    return task;
  }, [owner, storageMode]);

  const saveProfileToCloud = useCallback(async (p: Profile) => {
    const revision = modeRevision.current;
    const parsed = migrateLegacyProfileSkills(ProfileSchema.parse(p));
    const saved = storageMode === "local" ? (await saveLocalProfile(owner, parsed)).profile : await saveDatabaseProfile(parsed);
    if (revision !== modeRevision.current) return;
    ++refreshVersion.current;
    profileBaseline.current = saved;
    setProfile(current => sameSnapshot(current, p) ? saved : current);
  }, [owner, storageMode]);

  const switchStorageMode = useCallback((mode: StorageMode) => {
    if (mode === "cloud" && !cloudStorageAvailable) throw new Error("Cloud storage is disabled on this deployment.");
    if (mode === storageMode) return;
    ++modeRevision.current;
    ++refreshVersion.current;
    localStorage.setItem(`resume-storage-mode:${owner}`, mode);
    setReady(false);
    // Separate workspaces: switching never uploads or overwrites device data.
    setProfile(ProfileSchema.parse({})); setWorkspace(defaultWorkspacePayload());
    profileBaseline.current = ProfileSchema.parse({}); workspaceBaseline.current = defaultWorkspacePayload();
    setStorageMode(mode);
  }, [owner, storageMode]);
  const exportSnapshot = useCallback(async () => ({ version: 1 as const, profile: profileBaseline.current, workspace: workspaceBaseline.current }), []);
  const restoreSnapshot = useCallback(async (input: unknown) => {
    if (storageMode !== "local") throw new Error("Switch to device storage before restoring a backup.");
    const restored = parseLocalSnapshot(input);
    await replaceLocalWorkspace(owner, restored);
    ++refreshVersion.current;
    profileBaseline.current = restored.profile; workspaceBaseline.current = restored.workspace;
    setProfile(restored.profile); setWorkspace(restored.workspace);
  }, [owner, storageMode]);

  const value = useMemo(
    (): WorkspaceContextValue => ({
      storageMode, switchStorageMode, exportSnapshot, restoreSnapshot,
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
      storageMode, switchStorageMode, exportSnapshot, restoreSnapshot,
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
