"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildAiHeaders } from "../../lib/ai-client";
import type { ResumeDoc } from "../../lib/document-schemas";
import type { Profile } from "../../lib/profile-model";
import { mergeProfileForResume } from "../../lib/merge-profile-for-resume";
import { renderJakeResumeTex } from "../../lib/jake-latex";
import { JakeResumePreview } from "../../resumes/[id]/jake-preview";
import {
  useHydratedProfile,
  useHydratedResumes,
  useHydratedSettings,
  useWorkspaceOptimizations,
} from "../../lib/use-hydrated-storage";
import { AiMagicIcon } from "../../components/ai-magic-icon";
import { OptimizationModal } from "../../components/optimization-modal";

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}

export default function OptimizeResumePage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      }
    >
      <OptimizeResumeInner />
    </Suspense>
  );
}

function SelectionSummary({
  experienceRows,
  projectRows,
  compact,
}: {
  experienceRows: Array<{ id: string; label: string | null; dates: string | null }>;
  projectRows: Array<{ id: string; label: string | null; dates: string | null }>;
  compact?: boolean;
}) {
  const nExp = experienceRows.length;
  const nProj = projectRows.length;
  if (nExp === 0 && nProj === 0) return null;

  return (
    <div
      className={
        compact
          ? "space-y-3 text-sm"
          : "rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-700 dark:bg-zinc-900/40"
      }
    >
      {!compact ? (
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          <AiMagicIcon size="sm" />
          Selected for this JD (stage 1)
        </p>
      ) : (
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
          <AiMagicIcon size="sm" />
          Selection
        </p>
      )}
      <div
        className={
          compact
            ? "mt-2 grid gap-4 sm:grid-cols-2"
            : "mt-3 grid gap-5 sm:grid-cols-2"
        }
      >
        <div>
          <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            Experience ({nExp})
          </div>
          <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm text-zinc-800 dark:text-zinc-200">
            {experienceRows.map((row) => (
              <li key={row.id}>
                {row.label ?? (
                  <span className="text-amber-800 dark:text-amber-200">
                    Unknown id (check profile):{" "}
                    <code className="font-mono text-xs">{row.id}</code>
                  </span>
                )}
                {row.dates ? (
                  <span className="block pl-5 text-xs text-zinc-500">
                    {row.dates}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            Projects ({nProj})
          </div>
          <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm text-zinc-800 dark:text-zinc-200">
            {projectRows.map((row) => (
              <li key={row.id}>
                {row.label ?? (
                  <span className="text-amber-800 dark:text-amber-200">
                    Unknown id (check profile):{" "}
                    <code className="font-mono text-xs">{row.id}</code>
                  </span>
                )}
                {row.dates ? (
                  <span className="block pl-5 text-xs text-zinc-500">
                    {row.dates}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function lineDiffStats(original: string[], optimized: string[]) {
  const n = Math.max(original.length, optimized.length);
  let linesChanged = 0;
  for (let i = 0; i < n; i++) {
    if (
      (original[i] ?? "").trim() !== (optimized[i] ?? "").trim()
    ) {
      linesChanged++;
    }
  }
  return {
    linesChanged,
    profileCount: original.length,
    optimizedCount: optimized.length,
  };
}

function BulletOptimizationExplainer() {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-950/40">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
        <AiMagicIcon size="sm" />
        What &quot;Optimize bullets&quot; changes
      </p>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
        <li>
          Only the{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            selected roles and projects
          </span>{" "}
          from stage 1 are rewritten. Your saved profile and other resume
          sections stay untouched.
        </li>
        <li>
          Bullets are{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            tailored to the job description
          </span>{" "}
          you pasted: clearer impact, scope, and tools—using facts already in
          your profile.
        </li>
        <li>
          The model{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            must not invent
          </span>{" "}
          employers, titles, dates, degrees, or metrics. If you did not list a
          number, none is added.
        </li>
        <li>
          Output is kept{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            concise
          </span>{" "}
          (about one line per bullet). Preview and export use these versions;
          clearing bullet edits restores your profile wording.
        </li>
      </ul>
    </div>
  );
}

function BulletOverrideVsProfileSummary({
  experienceSections,
  projectSections,
}: {
  experienceSections: Array<{
    id: string;
    label: string | null;
    hasOverride: boolean;
    linesChanged: number;
    profileCount: number;
    optimizedCount: number;
  }>;
  projectSections: Array<{
    id: string;
    label: string | null;
    hasOverride: boolean;
    linesChanged: number;
    profileCount: number;
    optimizedCount: number;
  }>;
}) {
  const anyOverride =
    experienceSections.some((s) => s.hasOverride) ||
    projectSections.some((s) => s.hasOverride);
  if (!anyOverride) return null;

  function lineFor(s: (typeof experienceSections)[0]) {
    const name =
      s.label ?? (
        <code className="font-mono text-[11px]">{s.id}</code>
      );
    if (!s.hasOverride) {
      return (
        <li key={s.id}>
          {name}
          <span className="text-zinc-500">
            {" "}
            — using profile bullets (no AI block returned for this item).
          </span>
        </li>
      );
    }
    if (s.linesChanged === 0) {
      return (
        <li key={s.id}>
          {name}
          <span className="text-zinc-500">
            {" "}
            — same wording as your profile ({s.optimizedCount} bullet
            {s.optimizedCount === 1 ? "" : "s"}).
          </span>
        </li>
      );
    }
    return (
      <li key={s.id}>
        {name}
        <span className="text-zinc-600 dark:text-zinc-400">
          {" "}
          — {s.linesChanged} bullet line{s.linesChanged === 1 ? "" : "s"}{" "}
          edited vs profile ({s.profileCount} → {s.optimizedCount} lines).
        </span>
      </li>
    );
  }

  return (
    <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-200/90">
        <AiMagicIcon size="sm" />
        Last bullet optimization vs your profile
      </p>
      <p className="mt-2 text-xs text-emerald-900/80 dark:text-emerald-200/70">
        Line-by-line comparison of AI output to the bullets saved on your
        profile (not a judgment of quality).
      </p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        {experienceSections.length > 0 ? (
          <div>
            <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
              Experience
            </div>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-emerald-950 dark:text-emerald-50">
              {experienceSections.map(lineFor)}
            </ul>
          </div>
        ) : null}
        {projectSections.length > 0 ? (
          <div>
            <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-100">
              Projects
            </div>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-emerald-950 dark:text-emerald-50">
              {projectSections.map(lineFor)}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const labels = ["Select", "Bullets", "Export"];
  return (
    <div className="flex items-center gap-1 text-xs text-muted">
      {labels.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const active = step === n;
        const done = step > n;
        return (
          <span key={label} className="flex items-center gap-1">
            {i > 0 ? <span className="text-border-hover">/</span> : null}
            <span
              className={
                active
                  ? "font-semibold text-accent"
                  : done
                    ? "text-foreground"
                    : "text-muted"
              }
            >
              {n}. {label}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function formatBulletMap(
  expMap: Record<string, string[]>,
  projMap: Record<string, string[]>,
  profile: Profile,
): string {
  const expById = new Map(profile.experience.map((e) => [e.id, e]));
  const projById = new Map(profile.projects.map((p) => [p.id, p]));
  const lines: string[] = [];

  for (const [id, bullets] of Object.entries(expMap)) {
    const e = expById.get(id);
    const label = e ? (e.title && e.company ? `${e.title} @ ${e.company}` : e.title || e.company || id) : id;
    lines.push(`[${label}]`);
    for (const b of bullets) lines.push(`• ${b}`);
    lines.push("");
  }
  for (const [id, bullets] of Object.entries(projMap)) {
    const p = projById.get(id);
    const label = p?.name || id;
    lines.push(`[${label}]`);
    for (const b of bullets) lines.push(`• ${b}`);
    lines.push("");
  }

  if (lines.length === 0) {
    // Fall back to profile bullets for the selected IDs
    for (const e of profile.experience) {
      if (e.bullets.length === 0) continue;
      const label = e.title && e.company ? `${e.title} @ ${e.company}` : e.title || e.company || e.id;
      lines.push(`[${label}]`);
      for (const b of e.bullets) lines.push(`• ${b}`);
      lines.push("");
    }
    for (const p of profile.projects) {
      if (p.bullets.length === 0) continue;
      lines.push(`[${p.name || p.id}]`);
      for (const b of p.bullets) lines.push(`• ${b}`);
      lines.push("");
    }
  }

  return lines.join("\n").trim() || "(no bullets)";
}

function OptimizeResumeInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const baseId = sp.get("baseId") ?? "";

  const [profile] = useHydratedProfile();
  const [settings] = useHydratedSettings();
  const [resumes, , storageReady] = useHydratedResumes();
  const { resumeOptimizations, patchResumeOptimizations } =
    useWorkspaceOptimizations();
  const baseDoc: ResumeDoc | null = useMemo(
    () => resumes.find((d) => d.id === baseId) ?? null,
    [resumes, baseId]
  );

  const resumeProfile = useMemo(
    () =>
      baseDoc ? mergeProfileForResume(profile, baseDoc) : profile,
    [profile, baseDoc],
  );

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [jd, setJd] = useState("");
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [selectedExperienceIds, setSelectedExperienceIds] = useState<
    string[]
  >([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [outputMarkdown, setOutputMarkdown] = useState("");
  const [experienceBulletsById, setExperienceBulletsById] = useState<
    Record<string, string[]>
  >({});
  const [projectBulletsById, setProjectBulletsById] = useState<
    Record<string, string[]>
  >({});
  const [optModal, setOptModal] = useState<{
    beforeExp: Record<string, string[]>;
    beforeProj: Record<string, string[]>;
    afterExp: Record<string, string[]>;
    afterProj: Record<string, string[]>;
  } | null>(null);

  useEffect(() => {
    if (!storageReady || !baseId) return;
    const existingOpt = resumeOptimizations[baseId];
    if (!existingOpt) return;
    setJd(existingOpt.jd);
    setSelectedExperienceIds(existingOpt.selectedExperienceIds ?? []);
    setSelectedProjectIds(existingOpt.selectedProjectIds ?? []);
    setOutputMarkdown(existingOpt.outputMarkdown ?? "");
    setExperienceBulletsById(existingOpt.experienceBulletsById ?? {});
    setProjectBulletsById(existingOpt.projectBulletsById ?? {});
    if (
      (existingOpt.selectedExperienceIds?.length ?? 0) > 0 ||
      (existingOpt.selectedProjectIds?.length ?? 0) > 0
    ) {
      const hasOverrides =
        Object.keys(existingOpt.experienceBulletsById ?? {}).length > 0 ||
        Object.keys(existingOpt.projectBulletsById ?? {}).length > 0;
      setStep(hasOverrides ? 3 : 2);
    }
  }, [storageReady, baseId, resumeOptimizations]);

  const outputLatex = useMemo(() => {
    const hasPick =
      selectedExperienceIds.length > 0 || selectedProjectIds.length > 0;
    return renderJakeResumeTex({
      profile: resumeProfile,
      experienceIds: selectedExperienceIds,
      projectIds: selectedProjectIds,
      subsetEnabled: hasPick,
      title: baseDoc?.title ?? "resume",
      experienceBulletsById,
      projectBulletsById,
      highlightMetrics: true,
    });
  }, [
    resumeProfile,
    selectedExperienceIds,
    selectedProjectIds,
    baseDoc?.title,
    experienceBulletsById,
    projectBulletsById,
  ]);

  const selectedExperienceLabels = useMemo(() => {
    const byId = new Map(resumeProfile.experience.map((e) => [e.id, e]));
    return selectedExperienceIds.map((id) => {
      const e = byId.get(id);
      if (!e) return { id, label: null as string | null, dates: null };
      const title = (e.title || "").trim();
      const company = (e.company || "").trim();
      const label =
        title && company
          ? `${title} · ${company}`
          : title || company || id;
      const dates = [e.start, e.end].filter(Boolean).join(" – ");
      return { id, label, dates: dates || null };
    });
  }, [resumeProfile.experience, selectedExperienceIds]);

  const selectedProjectLabels = useMemo(() => {
    const byId = new Map(resumeProfile.projects.map((p) => [p.id, p]));
    return selectedProjectIds.map((id) => {
      const p = byId.get(id);
      if (!p) return { id, label: null as string | null, dates: null };
      const name = (p.name || "").trim();
      const role = (p.role || "").trim();
      const label =
        name && role ? `${name} · ${role}` : name || role || id;
      const dates = [p.start, p.end].filter(Boolean).join(" – ");
      return { id, label, dates: dates || null };
    });
  }, [resumeProfile.projects, selectedProjectIds]);

  const bulletOptimizationComparison = useMemo(() => {
    const expById = new Map(resumeProfile.experience.map((e) => [e.id, e]));
    const projById = new Map(resumeProfile.projects.map((p) => [p.id, p]));
    const expLabel = new Map(
      selectedExperienceLabels.map((r) => [r.id, r.label])
    );
    const projLabel = new Map(
      selectedProjectLabels.map((r) => [r.id, r.label])
    );

    const experienceSections = selectedExperienceIds.map((id) => {
      const orig = expById.get(id)?.bullets ?? [];
      const opt = experienceBulletsById[id];
      const hasOverride = opt !== undefined;
      const st = hasOverride
        ? lineDiffStats(orig, opt)
        : {
            linesChanged: 0,
            profileCount: orig.length,
            optimizedCount: orig.length,
          };
      return {
        id,
        label: expLabel.get(id) ?? null,
        hasOverride,
        ...st,
      };
    });

    const projectSections = selectedProjectIds.map((id) => {
      const orig = projById.get(id)?.bullets ?? [];
      const opt = projectBulletsById[id];
      const hasOverride = opt !== undefined;
      const st = hasOverride
        ? lineDiffStats(orig, opt)
        : {
            linesChanged: 0,
            profileCount: orig.length,
            optimizedCount: orig.length,
          };
      return {
        id,
        label: projLabel.get(id) ?? null,
        hasOverride,
        ...st,
      };
    });

    return { experienceSections, projectSections };
  }, [
    resumeProfile.experience,
    resumeProfile.projects,
    selectedExperienceIds,
    selectedProjectIds,
    experienceBulletsById,
    projectBulletsById,
    selectedExperienceLabels,
    selectedProjectLabels,
  ]);

  async function runStage1Select() {
    setError(null);
    if (!baseDoc) {
      setError("Base resume not found.");
      return;
    }
    if (!resumeProfile.name.trim()) {
      setError("Add your name in Profile before optimizing.");
      return;
    }
    if (!jd.trim()) {
      setError("Paste a job description first.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: buildAiHeaders(settings),
        body: JSON.stringify({
          kind: "resume",
          mode: "select",
          profile: resumeProfile,
          jd,
          skillsMd: settings.skillsMd ?? "",
          template: "jake",
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }

      const data = (await res.json()) as {
        selectedExperienceIds: string[];
        selectedProjectIds: string[];
        outputMarkdown: string;
      };

      const selExp = (data.selectedExperienceIds ?? []).slice(0, 4);
      const selProj = (data.selectedProjectIds ?? []).slice(0, 2);
      const md = data.outputMarkdown ?? "";
      setSelectedExperienceIds(selExp);
      setSelectedProjectIds(selProj);
      setOutputMarkdown(md);
      setExperienceBulletsById({});
      setProjectBulletsById({});
      setStep(2);

      const snapshotLatex = renderJakeResumeTex({
        profile: resumeProfile,
        experienceIds: selExp,
        projectIds: selProj,
        subsetEnabled: selExp.length > 0 || selProj.length > 0,
        title: baseDoc.title,
      });

      const map = {
        ...resumeOptimizations,
        [baseId]: {
          baseResumeId: baseId,
          jd,
          createdAt: Date.now(),
          selectedExperienceIds: selExp,
          selectedProjectIds: selProj,
          outputMarkdown: md,
          outputLatex: snapshotLatex,
          experienceBulletsById: {},
          projectBulletsById: {},
        },
      };
      await patchResumeOptimizations(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function runStage2Bullets() {
    setError(null);
    if (!baseDoc) {
      setError("Base resume not found.");
      return;
    }
    if (!jd.trim()) {
      setError("Paste a job description first.");
      return;
    }
    if (selectedExperienceIds.length === 0 && selectedProjectIds.length === 0) {
      setError("Run stage 1 first (select experiences/projects).");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: buildAiHeaders(settings),
        body: JSON.stringify({
          kind: "resume",
          mode: "bullets",
          profile: resumeProfile,
          jd,
          skillsMd: settings.skillsMd ?? "",
          selectedExperienceIds,
          selectedProjectIds,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }

      const data = (await res.json()) as {
        experienceBulletsById?: Record<string, string[]>;
        projectBulletsById?: Record<string, string[]>;
      };

      const expMap = data.experienceBulletsById ?? {};
      const projMap = data.projectBulletsById ?? {};

      // Build before/after text for the modal
      const prevExp = { ...experienceBulletsById };
      const prevProj = { ...projectBulletsById };

      setExperienceBulletsById(expMap);
      setProjectBulletsById(projMap);

      setOptModal({
        beforeExp: prevExp,
        beforeProj: prevProj,
        afterExp: expMap,
        afterProj: projMap,
      });

      const prev = resumeOptimizations[baseId];
      const map = {
        ...resumeOptimizations,
        [baseId]: {
          baseResumeId: baseId,
          jd,
          createdAt: prev?.createdAt ?? Date.now(),
          selectedExperienceIds,
          selectedProjectIds,
          outputMarkdown,
          outputLatex,
          experienceBulletsById: expMap,
          projectBulletsById: projMap,
        },
      };
      await patchResumeOptimizations(map);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function onDownloadPdf() {
    setError(null);
    setPdfBusy(true);
    try {
      const res = await fetch("/api/latex/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latex: outputLatex }),
      });
      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok) {
        let msg = `PDF compile failed (${res.status})`;
        if (ct.includes("application/json")) {
          const j = (await res.json()) as { error?: string; stderr?: string };
          const parts = [j.error, j.stderr?.trim()].filter(Boolean);
          msg = parts.join("\n\n").slice(0, 4000) || msg;
        } else {
          const t = await res.text();
          msg = t.slice(0, 800) || msg;
        }
        throw new Error(msg);
      }
      const blob = await res.blob();
      const base = (baseDoc?.title || "resume").replaceAll("/", "-");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setToast("PDF downloaded.");
      setTimeout(() => setToast(null), 1600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  if (!storageReady) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
    );
  }

  if (!baseDoc) {
    if (!baseId) {
      const sorted = [...resumes].sort((a, b) => b.updatedAt - a.updatedAt);
      return (
        <div className="mx-auto flex max-w-lg flex-col gap-8">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <AiMagicIcon size="lg" className="drop-shadow-sm" />
              Tailor a resume
            </h1>
            <p className="mt-2 text-sm text-muted">
              Pick a base resume to optimize for a job description.
            </p>
          </div>
          {sorted.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
              No resumes yet.{" "}
              <Link href="/resumes/new" className="font-medium text-accent underline underline-offset-2">
                Create one
              </Link>{" "}
              or go to{" "}
              <Link href="/documents" className="font-medium text-accent underline underline-offset-2">
                Documents
              </Link>
              .
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sorted.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() =>
                    router.push(
                      `/optimize/resume?baseId=${encodeURIComponent(doc.id)}`
                    )
                  }
                  className="group flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3.5 text-left transition-all hover:border-accent/40 hover:shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">
                      <AiMagicIcon size="sm" />
                    </span>
                    <span className="text-sm font-medium group-hover:text-accent transition-colors">{doc.title}</span>
                  </div>
                  <span className="text-xs text-muted">Select</span>
                </button>
              ))}
              <Link
                href="/documents"
                className="mt-2 text-center text-xs text-muted hover:text-foreground"
              >
                Manage documents
              </Link>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="text-sm text-zinc-600 dark:text-zinc-300">
        Missing or invalid <code className="font-mono text-xs">baseId</code>.
        Pick a base resume from{" "}
        <Link href="/documents" className="underline">
          Documents
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="flex min-w-0 items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            <AiMagicIcon size="md" className="shrink-0 drop-shadow-sm sm:h-5 sm:w-5" />
            <span className="truncate">{baseDoc.title}</span>
          </h1>
          <Stepper step={step} />
        </div>
        <Link
          href="/documents"
          className="text-sm text-zinc-500 underline-offset-4 hover:text-zinc-800 hover:underline dark:hover:text-zinc-200"
        >
          Documents
        </Link>
      </header>

      {error ? (
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      ) : null}
      {toast ? (
        <p className="text-sm text-emerald-800 dark:text-emerald-200">{toast}</p>
      ) : null}

      <section className="flex flex-col gap-3">
        <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Job description
        </label>
        <textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          rows={step === 1 ? 12 : 5}
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent"
          placeholder="Paste the JD…"
        />
      </section>

      {step === 1 ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            Pick the top four roles and two projects for this posting. Your
            saved resume file is not modified.
          </p>
          <button
            type="button"
            onClick={runStage1Select}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-3 text-sm font-medium text-white shadow-sm disabled:opacity-50 hover:bg-accent-dark"
          >
            <AiMagicIcon size="md" className="brightness-125 dark:brightness-100" />
            {busy ? "Working…" : "Continue"}
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="flex flex-col gap-6">
          <SelectionSummary
            experienceRows={selectedExperienceLabels}
            projectRows={selectedProjectLabels}
          />
          <BulletOptimizationExplainer />
          <BulletOverrideVsProfileSummary
            experienceSections={bulletOptimizationComparison.experienceSections}
            projectSections={bulletOptimizationComparison.projectSections}
          />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Run the optimizer to tailor bullets to the JD above, or skip to
            export with your profile wording.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            <button
              type="button"
              onClick={runStage2Bullets}
              disabled={busy}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-200 py-3 text-sm font-medium disabled:opacity-50 dark:border-zinc-600"
            >
              <AiMagicIcon size="md" />
              {busy ? "Optimizing…" : "Optimize bullets"}
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              className="flex-1 rounded-xl bg-accent py-3 text-sm font-medium text-white shadow-sm hover:bg-accent-dark"
            >
              Skip to export
            </button>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => {
                setExperienceBulletsById({});
                setProjectBulletsById({});
                const prev = resumeOptimizations[baseId];
                const map = {
                  ...resumeOptimizations,
                  [baseId]: {
                    baseResumeId: baseId,
                    jd,
                    createdAt: prev?.createdAt ?? Date.now(),
                    selectedExperienceIds,
                    selectedProjectIds,
                    outputMarkdown,
                    outputLatex,
                    experienceBulletsById: {},
                    projectBulletsById: {},
                  },
                };
                void patchResumeOptimizations(map);
                setToast("Using original bullets.");
                setTimeout(() => setToast(null), 1200);
              }}
              className="text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
            >
              Clear bullet edits
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="flex flex-col gap-10">
          <div className="space-y-4 text-sm text-zinc-600 dark:text-zinc-400">
            <SelectionSummary
              compact
              experienceRows={selectedExperienceLabels}
              projectRows={selectedProjectLabels}
            />
            <BulletOverrideVsProfileSummary
              experienceSections={bulletOptimizationComparison.experienceSections}
              projectSections={bulletOptimizationComparison.projectSections}
            />
            <p>
              {selectedExperienceIds.length} roles · {selectedProjectIds.length}{" "}
              projects
              {Object.keys(experienceBulletsById).length +
                Object.keys(projectBulletsById).length >
              0
                ? " · bullets revised"
                : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  downloadText(
                    `${(baseDoc.title || "resume").replaceAll("/", "-")}.tex`,
                    outputLatex
                  )
                }
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs dark:border-zinc-600"
              >
                .tex
              </button>
              <button
                type="button"
                onClick={() => void onDownloadPdf()}
                disabled={pdfBusy}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs disabled:opacity-50 dark:border-zinc-600"
              >
                {pdfBusy ? "Building PDF…" : "Download PDF"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await copyToClipboard(outputLatex);
                  setToast("Copied.");
                  setTimeout(() => setToast(null), 1200);
                }}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs dark:border-zinc-600"
              >
                Copy LaTeX
              </button>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-zinc-500">LaTeX source</summary>
              <textarea
                value={outputLatex}
                readOnly
                rows={8}
                className="mt-2 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-2 font-mono text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
              />
            </details>
          </div>

          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">
              Preview
            </div>
            <JakeResumePreview
              profile={resumeProfile}
              doc={{
                ...baseDoc,
                selected: {
                  experienceIds: selectedExperienceIds,
                  projectIds: selectedProjectIds,
                },
              }}
              experienceBulletsById={experienceBulletsById}
              projectBulletsById={projectBulletsById}
              highlightMetrics
            />
            <p className="mt-2 text-xs text-zinc-500">
              Use Download PDF to compile the LaTeX above; preview is for layout
              checks only.
            </p>
          </div>

          <div className="flex flex-wrap gap-4 text-sm text-zinc-500">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="hover:text-zinc-800 dark:hover:text-zinc-300"
            >
              ← Bullets
            </button>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="hover:text-zinc-800 dark:hover:text-zinc-300"
            >
              ← JD &amp; select
            </button>
          </div>
        </div>
      ) : null}

      {optModal ? (
        <OptimizationModal
          open
          title="Bullet optimization"
          before={formatBulletMap(optModal.beforeExp, optModal.beforeProj, resumeProfile)}
          after={formatBulletMap(optModal.afterExp, optModal.afterProj, resumeProfile)}
          onAccept={() => setOptModal(null)}
          onRevert={() => {
            setExperienceBulletsById(optModal.beforeExp);
            setProjectBulletsById(optModal.beforeProj);
            const prev = resumeOptimizations[baseId];
            const map = {
              ...resumeOptimizations,
              [baseId]: {
                baseResumeId: baseId,
                jd,
                createdAt: prev?.createdAt ?? Date.now(),
                selectedExperienceIds,
                selectedProjectIds,
                outputMarkdown,
                outputLatex,
                experienceBulletsById: optModal.beforeExp,
                projectBulletsById: optModal.beforeProj,
              },
            };
            void patchResumeOptimizations(map);
            setOptModal(null);
          }}
          onReoptimize={() => {
            setOptModal(null);
            void runStage2Bullets();
          }}
          onClose={() => setOptModal(null)}
          busy={busy}
        />
      ) : null}
    </div>
  );
}

