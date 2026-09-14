"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WandSparkles } from 'lucide-react';
import { buildAiHeaders } from "../lib/ai-client";
import { formatSavedBannerTime } from "../lib/format-date";
import type { Profile } from "../lib/document-schemas";
import { newSkillCategoryId } from "../lib/profile-model";
import { sortedExperience, sortedProjects } from "../lib/sort-profile";
import {
  useHydratedProfile,
  useHydratedSettings,
} from "../lib/use-hydrated-storage";
import { useWorkspace } from "../lib/workspace-context";
import { OptimizationModal } from "../components/optimization-modal";

function chipSplit(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function normalizeOptimizedBullet(raw: string) {
  return raw
    .trim()
    .replace(/^["'“”]+|["'“”]+$/g, "")
    .replace(/^[•\-\*]\s*/, "")
    .trim();
}

function experienceBulletContext(
  exp: Profile["experience"][number]
): string {
  const parts = [
    [exp.title, exp.company].filter(Boolean).join(" at "),
    [exp.start, exp.end].filter(Boolean).join("–"),
    exp.location?.trim(),
  ].filter(Boolean);
  return parts.join(" · ");
}

function projectBulletContext(proj: Profile["projects"][number]): string {
  const head = [proj.role, proj.name].filter(Boolean).join(" · ");
  const tech =
    proj.tech.length > 0 ? `Tech: ${proj.tech.join(", ")}` : "";
  return [head, tech].filter(Boolean).join(" · ");
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent",
        props.className
      )}
    />
  );
}

function SkillsInput({
  items,
  onCommit,
  placeholder,
}: {
  items: string[];
  onCommit: (next: string[]) => void;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState(items.join(", "));
  const lastCommittedRef = useRef(items.join(", "));

  const syncFromExternalItems = useCallback((next: string[]) => {
    const joined = next.join(", ");
    if (joined !== lastCommittedRef.current) {
      setRaw(joined);
      lastCommittedRef.current = joined;
    }
  }, []);

  // Sync external changes (e.g. profile reload) without clobbering
  // in-progress edits: syncFromExternalItems only calls setRaw when `items`
  // differs from what we last committed ourselves.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    syncFromExternalItems(items);
  }, [items, syncFromExternalItems]);

  function commit(value: string) {
    const next = chipSplit(value);
    const joined = next.join(", ");
    lastCommittedRef.current = joined;
    // Keep the user's trailing comma/space visible until they leave the field.
    onCommit(next);
  }

  return (
    <Input
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={(e) => {
        commit(e.target.value);
        setRaw(chipSplit(e.target.value).join(", "));
      }}
      placeholder={placeholder}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cx(
        "rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent",
        props.className
      )}
    />
  );
}

function SectionHeader({
  title,
  onAdd,
}: {
  title: string;
  onAdd?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-base font-semibold">{title}</div>
      {onAdd ? (
        <button
          onClick={onAdd}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-lg leading-none hover:bg-zinc-50 dark:hover:bg-zinc-800"
          aria-label={`Add ${title}`}
          title={`Add ${title}`}
        >
          +
        </button>
      ) : null}
    </div>
  );
}

export default function ProfilePage() {
  const [profile, setProfile, storageReady] = useHydratedProfile();
  const [settings] = useHydratedSettings();
  const { saveProfileToCloud } = useWorkspace();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [bulletBusyKey, setBulletBusyKey] = useState<string | null>(null);
  const [bulletError, setBulletError] = useState<string | null>(null);
  const [techDraftByProjId, setTechDraftByProjId] = useState<
    Record<string, string>
  >({});
  /** Brief "Saved" flash for per-entry Save buttons. */
  const [saveFlashByCard, setSaveFlashByCard] = useState<Record<string, boolean>>(
    {},
  );
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [optModal, setOptModal] = useState<{
    before: string;
    after: string;
    applyFn: () => void;
    reoptimizeFn: () => void;
  } | null>(null);

  async function persistProfileSnapshot(next: Profile) {
    try {
      await saveProfileToCloud(next);
      setCloudSyncError(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Profile sync failed";
      console.error("Profile save failed:", e);
      setCloudSyncError(msg);
    }
  }

  const experienceSorted = useMemo(() => sortedExperience(profile), [profile]);
  const projectsSorted = useMemo(() => sortedProjects(profile), [profile]);

  function commitTechDraft(projId: string) {
    const raw = techDraftByProjId[projId];
    if (raw === undefined) return;
    const parsed = chipSplit(raw);
    setProfile((p) => ({
      ...p,
      projects: p.projects.map((pr) =>
        pr.id === projId ? { ...pr, tech: parsed } : pr
      ),
    }));
    setTechDraftByProjId((m) => {
      const next = { ...m };
      delete next[projId];
      return next;
    });
  }

  async function saveProfileFromState() {
    setSavedAt(Date.now());
    await persistProfileSnapshot(profile);
  }

  async function onSave() {
    let next = profile;
    for (const proj of next.projects) {
      const raw = techDraftByProjId[proj.id];
      if (raw === undefined) continue;
      const parsed = chipSplit(raw);
      next = {
        ...next,
        projects: next.projects.map((pr) =>
          pr.id === proj.id ? { ...pr, tech: parsed } : pr
        ),
      };
    }
    setProfile(next);
    setTechDraftByProjId({});
    setSavedAt(Date.now());
    await persistProfileSnapshot(next);
  }

  function flashCardSaved(key: string) {
    setSaveFlashByCard((m) => ({ ...m, [key]: true }));
    window.setTimeout(() => {
      setSaveFlashByCard((m) => {
        const next = { ...m };
        delete next[key];
        return next;
      });
    }, 2000);
  }

  /** Commit this project’s tech draft (if any), then persist. */
  async function saveProjectCard(projId: string) {
    let next = profile;
    const raw = techDraftByProjId[projId];
    if (raw !== undefined) {
      const parsed = chipSplit(raw);
      next = {
        ...next,
        projects: next.projects.map((pr) =>
          pr.id === projId ? { ...pr, tech: parsed } : pr,
        ),
      };
      setTechDraftByProjId((m) => {
        const n = { ...m };
        delete n[projId];
        return n;
      });
    }
    setProfile(next);
    setSavedAt(Date.now());
    await persistProfileSnapshot(next);
  }

  async function optimizeExperienceBullet(expId: string, bulletIndex: number) {
    const exp = profile.experience.find((e) => e.id === expId);
    const draft = exp?.bullets[bulletIndex]?.trim() ?? "";
    if (!draft) return;
    const key = `exp:${expId}:${bulletIndex}`;
    setBulletError(null);
    setBulletBusyKey(key);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: buildAiHeaders(settings),
        body: JSON.stringify({
          kind: "profileBullet",
          profile,
          skillsMd: settings.skillsMd ?? "",
          profileBulletDraft: draft,
          profileBulletContext: exp ? experienceBulletContext(exp) : "",
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { optimizedBullet?: string };
      const nextText = normalizeOptimizedBullet(data.optimizedBullet ?? "");
      if (!nextText) throw new Error("Empty bullet from model.");

      function applyOptimized() {
        const eIdx = profile.experience.findIndex((e) => e.id === expId);
        if (eIdx === -1) return;
        const nextExp = [...profile.experience];
        const bullets = [...nextExp[eIdx].bullets];
        bullets[bulletIndex] = nextText;
        nextExp[eIdx] = { ...nextExp[eIdx], bullets };
        const nextProfile = { ...profile, experience: nextExp };
        setProfile(nextProfile);
        setSavedAt(Date.now());
        void persistProfileSnapshot(nextProfile);
        setOptModal(null);
      }

      setOptModal({
        before: draft,
        after: nextText,
        applyFn: applyOptimized,
        reoptimizeFn: () => {
          setOptModal(null);
          void optimizeExperienceBullet(expId, bulletIndex);
        },
      });
    } catch (e) {
      setBulletError(e instanceof Error ? e.message : "Optimize failed.");
    } finally {
      setBulletBusyKey(null);
    }
  }

  async function optimizeProjectBullet(projId: string, bulletIndex: number) {
    const proj = profile.projects.find((p) => p.id === projId);
    const draft = proj?.bullets[bulletIndex]?.trim() ?? "";
    if (!draft) return;
    const key = `proj:${projId}:${bulletIndex}`;
    setBulletError(null);
    setBulletBusyKey(key);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: buildAiHeaders(settings),
        body: JSON.stringify({
          kind: "profileBullet",
          profile,
          skillsMd: settings.skillsMd ?? "",
          profileBulletDraft: draft,
          profileBulletContext: proj ? projectBulletContext(proj) : "",
        }),
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `Request failed (${res.status})`);
      }
      const data = (await res.json()) as { optimizedBullet?: string };
      const nextText = normalizeOptimizedBullet(data.optimizedBullet ?? "");
      if (!nextText) throw new Error("Empty bullet from model.");

      function applyOptimized() {
        const pIdx = profile.projects.findIndex((p) => p.id === projId);
        if (pIdx === -1) return;
        const nextProj = [...profile.projects];
        const bullets = [...nextProj[pIdx].bullets];
        bullets[bulletIndex] = nextText;
        nextProj[pIdx] = { ...nextProj[pIdx], bullets };
        const nextProfile = { ...profile, projects: nextProj };
        setProfile(nextProfile);
        setSavedAt(Date.now());
        void persistProfileSnapshot(nextProfile);
        setOptModal(null);
      }

      setOptModal({
        before: draft,
        after: nextText,
        applyFn: applyOptimized,
        reoptimizeFn: () => {
          setOptModal(null);
          void optimizeProjectBullet(projId, bulletIndex);
        },
      });
    } catch (e) {
      setBulletError(e instanceof Error ? e.message : "Optimize failed.");
    } finally {
      setBulletBusyKey(null);
    }
  }

  if (!storageReady) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Fill this once. We’ll tailor resumes/cover letters per job description.
            Use{" "}
            <span className="inline-flex items-center gap-1.5 font-medium">
              <WandSparkles size={14} className="shrink-0" />
              XYZ optimize
            </span>{" "}
            on a bullet to
            rewrite it in Google-style “Accomplished X as measured by Y by doing
            Z” form (no JD—uses your{" "}
            <Link href="/settings" className="underline">
              Settings
            </Link>{" "}
            AI provider).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onSave()}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-dark"
        >
          Save
        </button>
      </div>

      {savedAt ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-100">
          Saved {formatSavedBannerTime(savedAt)}.
        </div>
      ) : null}

      {bulletError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-100">
          {bulletError}
        </div>
      ) : null}

      {cloudSyncError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          Could not save profile to the database: {cloudSyncError}. Your edits
          are still on this page. Check that the <code className="rounded bg-amber-100/80 px-1 dark:bg-amber-900/60">profiles</code> table exists (run the migration SQL) and you are signed in.
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
          <SectionHeader title="Basics" />
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                placeholder="Your full name"
              />
            </Field>
            <Field label="Location">
              <Input
                value={profile.location ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, location: e.target.value })
                }
                placeholder="Buffalo, NY, USA"
              />
            </Field>
            <Field label="Email">
              <Input
                value={profile.email ?? ""}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                placeholder="you@email.com"
              />
            </Field>
            <Field label="Phone">
              <Input
                value={profile.phone ?? ""}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="+1 (555) 555-5555"
              />
            </Field>
          </div>

          <div className="mt-4 grid gap-3">
            <Field label="Summary">
              <Textarea
                value={profile.summary ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, summary: e.target.value })
                }
                rows={4}
                placeholder="2-3 lines on what you do best…"
              />
            </Field>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <SectionHeader
          title="Work Experience"
          onAdd={() => {
            setProfile({
              ...profile,
              experience: [
                ...profile.experience,
                {
                  id: `exp_${crypto.randomUUID()}`,
                  company: "",
                  title: "",
                  location: "",
                  start: "",
                  end: "",
                  type: "",
                  bullets: [],
                },
              ],
            });
          }}
        />
        <div className="mt-3 grid gap-3">
          {experienceSorted.map((exp) => {
            const idx = profile.experience.findIndex((e) => e.id === exp.id);
            return (
            <div
              key={exp.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200">
                      <span className="text-sm font-semibold">💼</span>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {exp.title || "(Role title)"}
                      </div>
                      <div className="truncate text-xs text-zinc-600 dark:text-zinc-300">
                        {exp.company || "(Company)"}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                          {exp.location || "Location"}
                        </span>
                        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                          {(exp.start || "Start")} – {(exp.end || "End")}
                        </span>
                        {exp.type ? (
                          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                            {exp.type}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((m) => ({ ...m, [exp.id]: !m[exp.id] }))
                      }
                      className="rounded-xl border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/60"
                    >
                      {expanded[exp.id] ? "Close" : "Edit"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void saveProfileFromState().then(() =>
                          flashCardSaved(`exp:${exp.id}`),
                        );
                      }}
                      className={cx(
                        "rounded-xl border px-3 py-2 text-sm font-medium transition",
                        saveFlashByCard[`exp:${exp.id}`]
                          ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-100"
                          : "border-zinc-200 text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900/60",
                      )}
                    >
                      {saveFlashByCard[`exp:${exp.id}`] ? "Saved" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfile({
                          ...profile,
                          experience: profile.experience.filter(
                            (e) => e.id !== exp.id,
                          ),
                        });
                      }}
                      className="rounded-xl px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900/60"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {exp.bullets.length ? (
                  <ul className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-200">
                    {exp.bullets.map((b, bIdx) => {
                      const bKey = `exp:${exp.id}:${bIdx}`;
                      const busy = bulletBusyKey === bKey;
                      return (
                        <li
                          key={`${exp.id}-b-${bIdx}`}
                          className="flex flex-wrap items-start gap-2 border-l-2 border-zinc-200 pl-3 dark:border-zinc-700"
                        >
                          <span className="min-w-0 flex-1 leading-relaxed">
                            {b}
                          </span>
                          <button
                            type="button"
                            disabled={busy || !b.trim()}
                            onClick={() =>
                              void optimizeExperienceBullet(exp.id, bIdx)
                            }
                            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-violet-200/90 bg-gradient-to-br from-violet-100 via-purple-50 to-violet-100 px-3 py-1.5 text-xs font-medium text-violet-950 shadow-sm hover:from-violet-200/90 hover:via-purple-100 hover:to-violet-200/90 disabled:opacity-40 dark:border-violet-800/80 dark:from-violet-950/70 dark:via-purple-950/50 dark:to-violet-950/70 dark:text-violet-100 dark:hover:from-violet-900/80 dark:hover:via-purple-900/60 dark:hover:to-violet-900/80"
                            title="Rewrite as Google-style XYZ (Accomplished X as measured by Y by doing Z)"
                          >
                            <WandSparkles size={14} className="shrink-0" />
                            {busy ? "…" : "XYZ optimize"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="mt-3 text-sm text-zinc-500">
                    No bullets yet.
                  </div>
                )}

                {expanded[exp.id] ? (
                  <div className="mt-4 grid gap-3 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-900/40 sm:grid-cols-2">
                    <Field label="Role title">
                      <Input
                        value={exp.title}
                        onChange={(e) => {
                          const next = [...profile.experience];
                          next[idx] = { ...exp, title: e.target.value };
                          setProfile({ ...profile, experience: next });
                        }}
                      />
                    </Field>
                    <Field label="Company">
                      <Input
                        value={exp.company}
                        onChange={(e) => {
                          const next = [...profile.experience];
                          next[idx] = { ...exp, company: e.target.value };
                          setProfile({ ...profile, experience: next });
                        }}
                      />
                    </Field>
                    <Field label="Location">
                      <Input
                        value={exp.location ?? ""}
                        onChange={(e) => {
                          const next = [...profile.experience];
                          next[idx] = { ...exp, location: e.target.value };
                          setProfile({ ...profile, experience: next });
                        }}
                        placeholder="Buffalo, NY, USA"
                      />
                    </Field>
                    <Field label="Type (e.g. Part-time / Internship)">
                      <Input
                        value={exp.type ?? ""}
                        onChange={(e) => {
                          const next = [...profile.experience];
                          next[idx] = { ...exp, type: e.target.value };
                          setProfile({ ...profile, experience: next });
                        }}
                        placeholder="Internship"
                      />
                    </Field>
                    <Field label="Start">
                      <Input
                        value={exp.start ?? ""}
                        onChange={(e) => {
                          const next = [...profile.experience];
                          next[idx] = { ...exp, start: e.target.value };
                          setProfile({ ...profile, experience: next });
                        }}
                        placeholder="May 2025"
                      />
                    </Field>
                    <Field label="End">
                      <Input
                        value={exp.end ?? ""}
                        onChange={(e) => {
                          const next = [...profile.experience];
                          next[idx] = { ...exp, end: e.target.value };
                          setProfile({ ...profile, experience: next });
                        }}
                        placeholder="Aug 2025"
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Bullets (one per line)">
                        <Textarea
                          value={exp.bullets.join("\n")}
                          onChange={(e) => {
                            const next = [...profile.experience];
                            next[idx] = {
                              ...exp,
                              bullets: e.target.value
                                .split("\n")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            };
                            setProfile({ ...profile, experience: next });
                          }}
                          rows={6}
                          className="font-mono text-xs"
                        />
                      </Field>
                    </div>
                  </div>
                ) : null}
            </div>
          );
          })}
          {profile.experience.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
              No work experience yet. Click “+” to add one.
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <SectionHeader
          title="Projects & Outside Experience"
          onAdd={() => {
            setProfile({
              ...profile,
              projects: [
                ...profile.projects,
                {
                  id: `proj_${crypto.randomUUID()}`,
                  role: "",
                  name: "",
                  link: "",
                  location: "",
                  start: "",
                  end: "",
                  tech: [],
                  bullets: [],
                },
              ],
            });
          }}
        />
        <div className="mt-3 grid gap-3">
          {projectsSorted.map((proj) => {
            const idx = profile.projects.findIndex((p) => p.id === proj.id);
            return (
            <div
              key={proj.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200">
                      <span className="text-sm font-semibold">🛠</span>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {proj.role || "(Role)"}{" "}
                        <span className="font-normal text-zinc-500">•</span>{" "}
                        {proj.name || "(Project)"}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                          {(proj.start || "Start")} – {(proj.end || "End")}
                        </span>
                        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] text-zinc-700 dark:bg-zinc-900 dark:text-zinc-200">
                          {proj.location || "Location"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((m) => ({ ...m, [proj.id]: !m[proj.id] }))
                      }
                      className="rounded-xl border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/60"
                    >
                      {expanded[proj.id] ? "Close" : "Edit"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void saveProjectCard(proj.id).then(() =>
                          flashCardSaved(`proj:${proj.id}`),
                        );
                      }}
                      className={cx(
                        "rounded-xl border px-3 py-2 text-sm font-medium transition",
                        saveFlashByCard[`proj:${proj.id}`]
                          ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-100"
                          : "border-zinc-200 text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900/60",
                      )}
                    >
                      {saveFlashByCard[`proj:${proj.id}`] ? "Saved" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfile({
                          ...profile,
                          projects: profile.projects.filter(
                            (p) => p.id !== proj.id,
                          ),
                        });
                      }}
                      className="rounded-xl px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900/60"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {proj.bullets.length ? (
                  <ul className="mt-3 space-y-2 text-sm text-zinc-700 dark:text-zinc-200">
                    {proj.bullets.map((b, bIdx) => {
                      const bKey = `proj:${proj.id}:${bIdx}`;
                      const busy = bulletBusyKey === bKey;
                      return (
                        <li
                          key={`${proj.id}-b-${bIdx}`}
                          className="flex flex-wrap items-start gap-2 border-l-2 border-zinc-200 pl-3 dark:border-zinc-700"
                        >
                          <span className="min-w-0 flex-1 leading-relaxed">
                            {b}
                          </span>
                          <button
                            type="button"
                            disabled={busy || !b.trim()}
                            onClick={() =>
                              void optimizeProjectBullet(proj.id, bIdx)
                            }
                            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-violet-200/90 bg-gradient-to-br from-violet-100 via-purple-50 to-violet-100 px-3 py-1.5 text-xs font-medium text-violet-950 shadow-sm hover:from-violet-200/90 hover:via-purple-100 hover:to-violet-200/90 disabled:opacity-40 dark:border-violet-800/80 dark:from-violet-950/70 dark:via-purple-950/50 dark:to-violet-950/70 dark:text-violet-100 dark:hover:from-violet-900/80 dark:hover:via-purple-900/60 dark:hover:to-violet-900/80"
                            title="Rewrite as Google-style XYZ (Accomplished X as measured by Y by doing Z)"
                          >
                            <WandSparkles size={14} className="shrink-0" />
                            {busy ? "…" : "XYZ optimize"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="mt-3 text-sm text-zinc-500">
                    No bullets yet.
                  </div>
                )}

                {proj.link ? (
                  <div className="mt-2 text-sm text-sky-700 underline underline-offset-2 dark:text-sky-300">
                    {proj.link}
                  </div>
                ) : null}

                {expanded[proj.id] ? (
                  <div className="mt-4 grid gap-3 rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-900/40 sm:grid-cols-2">
                    <Field label="Role (e.g. Full Stack Developer)">
                      <Input
                        value={proj.role ?? ""}
                        onChange={(e) => {
                          const next = [...profile.projects];
                          next[idx] = { ...proj, role: e.target.value };
                          setProfile({ ...profile, projects: next });
                        }}
                      />
                    </Field>
                    <Field label="Project name (e.g. NextUp)">
                      <Input
                        value={proj.name}
                        onChange={(e) => {
                          const next = [...profile.projects];
                          next[idx] = { ...proj, name: e.target.value };
                          setProfile({ ...profile, projects: next });
                        }}
                      />
                    </Field>
                    <Field label="Start">
                      <Input
                        value={proj.start ?? ""}
                        onChange={(e) => {
                          const next = [...profile.projects];
                          next[idx] = { ...proj, start: e.target.value };
                          setProfile({ ...profile, projects: next });
                        }}
                        placeholder="Dec 2024"
                      />
                    </Field>
                    <Field label="End">
                      <Input
                        value={proj.end ?? ""}
                        onChange={(e) => {
                          const next = [...profile.projects];
                          next[idx] = { ...proj, end: e.target.value };
                          setProfile({ ...profile, projects: next });
                        }}
                        placeholder="Present"
                      />
                    </Field>
                    <Field label="Location">
                      <Input
                        value={proj.location ?? ""}
                        onChange={(e) => {
                          const next = [...profile.projects];
                          next[idx] = { ...proj, location: e.target.value };
                          setProfile({ ...profile, projects: next });
                        }}
                        placeholder="Buffalo, NY, USA"
                      />
                    </Field>
                    <Field label="Link (optional)">
                      <Input
                        value={proj.link ?? ""}
                        onChange={(e) => {
                          const next = [...profile.projects];
                          next[idx] = { ...proj, link: e.target.value };
                          setProfile({ ...profile, projects: next });
                        }}
                        placeholder="https://github.com/…"
                      />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field label="Tech (comma-separated)">
                        <Input
                          value={
                            techDraftByProjId[proj.id] ??
                            proj.tech.join(", ")
                          }
                          onChange={(e) =>
                            setTechDraftByProjId((m) => ({
                              ...m,
                              [proj.id]: e.target.value,
                            }))
                          }
                          onBlur={() => commitTechDraft(proj.id)}
                          placeholder="TypeScript, Next.js, Postgres, …"
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <Field label="Bullets (one per line)">
                        <Textarea
                          value={proj.bullets.join("\n")}
                          onChange={(e) => {
                            const next = [...profile.projects];
                            next[idx] = {
                              ...proj,
                              bullets: e.target.value
                                .split("\n")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            };
                            setProfile({ ...profile, projects: next });
                          }}
                          rows={6}
                          className="font-mono text-xs"
                        />
                      </Field>
                    </div>
                  </div>
                ) : null}
            </div>
          );
          })}
          {profile.projects.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
              No projects yet. Click “+” to add one.
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <SectionHeader
          title="Education"
          onAdd={() => {
            setProfile({
              ...profile,
              education: [
                ...profile.education,
                {
                  id: `edu_${crypto.randomUUID()}`,
                  school: "",
                  degree: "",
                  location: "",
                  start: "",
                  end: "",
                  details: [],
                },
              ],
            });
          }}
        />
        <div className="mt-3 grid gap-3">
          {profile.education.map((ed, idx) => (
            <div
              key={ed.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">
                      {ed.school || "(School)"} {ed.degree ? `• ${ed.degree}` : ""}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {(ed.start || "Start")} — {(ed.end || "End")}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void saveProfileFromState().then(() =>
                          flashCardSaved(`edu:${ed.id}`),
                        )
                      }
                      className={cx(
                        "rounded-xl border px-3 py-2 text-sm font-medium transition",
                        saveFlashByCard[`edu:${ed.id}`]
                          ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-100"
                          : "border-zinc-200 text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900/60",
                      )}
                    >
                      {saveFlashByCard[`edu:${ed.id}`] ? "Saved" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setProfile({
                          ...profile,
                          education: profile.education.filter((e) => e.id !== ed.id),
                        });
                      }}
                      className="rounded-xl px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900/60"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="School">
                    <Input
                      value={ed.school}
                      onChange={(e) => {
                        const next = [...profile.education];
                        next[idx] = { ...ed, school: e.target.value };
                        setProfile({ ...profile, education: next });
                      }}
                    />
                  </Field>
                  <Field label="Degree">
                    <Input
                      value={ed.degree ?? ""}
                      onChange={(e) => {
                        const next = [...profile.education];
                        next[idx] = { ...ed, degree: e.target.value };
                        setProfile({ ...profile, education: next });
                      }}
                    />
                  </Field>
                  <Field label="Start">
                    <Input
                      value={ed.start ?? ""}
                      onChange={(e) => {
                        const next = [...profile.education];
                        next[idx] = { ...ed, start: e.target.value };
                        setProfile({ ...profile, education: next });
                      }}
                    />
                  </Field>
                  <Field label="End">
                    <Input
                      value={ed.end ?? ""}
                      onChange={(e) => {
                        const next = [...profile.education];
                        next[idx] = { ...ed, end: e.target.value };
                        setProfile({ ...profile, education: next });
                      }}
                    />
                  </Field>
                </div>

                <div className="mt-3">
                  <Field label="Details (one per line)">
                    <Textarea
                      value={(ed.details ?? []).join("\n")}
                      onChange={(e) => {
                        const next = [...profile.education];
                        next[idx] = {
                          ...ed,
                          details: e.target.value
                            .split("\n")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        };
                        setProfile({ ...profile, education: next });
                      }}
                      rows={4}
                      className="font-mono text-xs"
                    />
                  </Field>
                </div>
            </div>
          ))}
          {profile.education.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
              No education entries yet. Click “+” to add one.
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <SectionHeader
          title="Portfolio & Links"
          onAdd={() => {
            setProfile({
              ...profile,
              links: [
                ...profile.links,
                {
                  id: `link_${crypto.randomUUID()}`,
                  label: "LinkedIn URL",
                  url: "",
                },
              ],
            });
          }}
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {profile.links.map((l, idx) => {
            const linkRowKey = l.id ?? `i${idx}`;
            return (
            <div
              key={linkRowKey}
              className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-200">
                  <span className="text-sm font-semibold">🔗</span>
                </div>
                <div className="grid flex-1 gap-3">
                  <Field label="Label">
                    <Input
                      value={l.label}
                      onChange={(e) => {
                        const next = [...profile.links];
                        next[idx] = { ...l, label: e.target.value };
                        setProfile({ ...profile, links: next });
                      }}
                      placeholder="LinkedIn URL"
                    />
                  </Field>
                  <Field label="URL">
                    <Input
                      value={l.url}
                      onChange={(e) => {
                        const next = [...profile.links];
                        next[idx] = { ...l, url: e.target.value };
                        setProfile({ ...profile, links: next });
                      }}
                      placeholder="https://…"
                    />
                  </Field>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void saveProfileFromState().then(() =>
                        flashCardSaved(`link:${linkRowKey}`),
                      )
                    }
                    className={cx(
                      "rounded-xl border px-3 py-2 text-sm font-medium transition",
                      saveFlashByCard[`link:${linkRowKey}`]
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-100"
                        : "border-zinc-200 text-zinc-800 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-100 dark:hover:bg-zinc-900/60",
                    )}
                  >
                    {saveFlashByCard[`link:${linkRowKey}`] ? "Saved" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfile({
                        ...profile,
                        links: profile.links.filter((_, i) => i !== idx),
                      });
                    }}
                    className="rounded-xl px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900/60"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
          })}
          {profile.links.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300 sm:col-span-2">
              No links yet. Click “+” to add LinkedIn/GitHub/Portfolio.
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <SectionHeader
          title="Skills"
          onAdd={() => {
            setProfile({
              ...profile,
              skillCategories: [
                ...profile.skillCategories,
                { id: newSkillCategoryId(), label: "", items: [] },
              ],
            });
          }}
        />
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Optional: add labeled groups (e.g. Technical vs. soft skills), each with a
          comma-separated list. Use “+” to add a group. Leave this empty if you do not
          want a skills block on your resume.
        </p>

        <div className="mt-4 grid gap-4">
          {profile.skillCategories.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
              No skill groups yet. Click “+” above only if you want skills on your
              resume.
            </div>
          ) : null}
          {profile.skillCategories.map((cat, catIdx) => (
            <div
              key={cat.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-zinc-500">
                  Group {catIdx + 1}
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      void saveProfileFromState().then(() =>
                        flashCardSaved(`skillcat:${cat.id}`),
                      )
                    }
                    className={cx(
                      "rounded-lg border px-2 py-1 text-xs font-medium",
                      saveFlashByCard[`skillcat:${cat.id}`]
                        ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/25 dark:text-emerald-100"
                        : "border-zinc-200 dark:border-zinc-700",
                    )}
                  >
                    {saveFlashByCard[`skillcat:${cat.id}`] ? "Saved" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfile({
                        ...profile,
                        skillCategories: profile.skillCategories.filter(
                          (c) => c.id !== cat.id,
                        ),
                      });
                    }}
                    className="text-xs text-zinc-500 hover:underline"
                  >
                    Remove group
                  </button>
                </div>
              </div>
              <div className="mt-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">Label</span>
                  <Input
                    value={cat.label}
                    onChange={(e) => {
                      const next = [...profile.skillCategories];
                      next[catIdx] = {
                        ...cat,
                        label: e.target.value,
                      };
                      setProfile({ ...profile, skillCategories: next });
                    }}
                    placeholder="e.g. Technical skills, Languages, Leadership…"
                    className="font-medium"
                  />
                </label>
              </div>
              <div className="mt-3">
                <Field label="Skills (comma-separated)">
                  <SkillsInput
                    items={cat.items}
                    onCommit={(nextItems) => {
                      const nextCats = [...profile.skillCategories];
                      nextCats[catIdx] = { ...cat, items: nextItems };
                      const nextProfile = {
                        ...profile,
                        skillCategories: nextCats,
                      };
                      setProfile(nextProfile);
                      void persistProfileSnapshot(nextProfile).then(() =>
                        flashCardSaved(`skillcat:${cat.id}`),
                      );
                    }}
                    placeholder="Python, AWS, Docker, …"
                  />
                </Field>
                <p className="mt-1.5 text-xs text-muted">
                  Saved automatically when you click away.
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {cat.items.slice(0, 24).map((s, idx) => (
                  <span
                    key={`${cat.id}-${s}-${idx}`}
                    className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs text-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
                  >
                    {s}
                  </span>
                ))}
                {cat.items.length > 24 ? (
                  <span className="text-xs text-zinc-500">
                    +{cat.items.length - 24} more
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {optModal ? (
        <OptimizationModal
          open
          title="Bullet optimization"
          before={optModal.before}
          after={optModal.after}
          onAccept={optModal.applyFn}
          onRevert={() => setOptModal(null)}
          onReoptimize={optModal.reoptimizeFn}
          onClose={() => setOptModal(null)}
          busy={bulletBusyKey !== null}
        />
      ) : null}
    </div>
  );
}

