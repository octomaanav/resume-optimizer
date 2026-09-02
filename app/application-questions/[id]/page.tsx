"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ApplicationAnswerDoc } from "../../lib/document-schemas";
import {
  useHydratedApplicationAnswerDocs,
  useWorkspaceOptimizations,
} from "../../lib/use-hydrated-storage";
import { AiMagicIcon } from "../../components/ai-magic-icon";

const QUESTION_PRESETS = [
  "Why do you want to work at this company?",
  "Why are you a strong candidate for this role?",
  "Tell us about a challenge you overcame.",
  "Describe a project you are proud of.",
];

const BOARD_OPTIONS = [
  { value: "", label: "Other / Generic" },
  { value: "ashby", label: "Ashby" },
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
  { value: "workday", label: "Workday" },
  { value: "workable", label: "Workable" },
  { value: "smartrecruiters", label: "SmartRecruiters" },
  { value: "icims", label: "iCIMS" },
  { value: "bamboohr", label: "BambooHR" },
  { value: "rippling", label: "Rippling" },
];

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ApplicationQuestionDetailPage() {
  const params = useParams();
  const id = String(params.id);

  const [docs, setDocs, storageReady, persistApplicationAnswerDocs] =
    useHydratedApplicationAnswerDocs();
  const { applicationAnswerOptimizations } = useWorkspaceOptimizations();
  const doc = useMemo(() => docs.find((d) => d.id === id) ?? null, [docs, id]);

  const lastOpt = useMemo(() => {
    return applicationAnswerOptimizations[id] ?? null;
  }, [applicationAnswerOptimizations, id]);

  // Inputs are driven directly from `doc` (the persisted source of truth), so no
  // mirror state / sync effect is needed — each edit persists immediately.
  function persist(nextDoc: ApplicationAnswerDoc) {
    const next = docs.map((d) => (d.id === nextDoc.id ? nextDoc : d));
    setDocs(next);
    void persistApplicationAnswerDocs(next);
  }

  if (!storageReady) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
    );
  }

  if (!doc) {
    return (
      <div className="text-sm text-zinc-600 dark:text-zinc-300">
        Template not found.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {doc.title}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Base question + answer for reuse. Your template is not overwritten
            when you optimize for a JD.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/optimize/application-question?baseId=${encodeURIComponent(doc.id)}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-accent/30 bg-accent-light px-3 py-2 text-sm font-medium text-accent hover:bg-accent/15"
          >
            <AiMagicIcon size="sm" />
            Optimize for JD
          </Link>
          <button
            type="button"
            onClick={() =>
              downloadText(
                `${(doc.title || "qa").replaceAll("/", "-")}-template.txt`,
                `Question:\n${doc.question ?? ""}\n\n---\n\n${doc.templateAnswer ?? ""}`
              )
            }
            className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Download template
          </button>
        </div>
      </div>

      {lastOpt?.tailoredAnswer?.trim() ? (
        <div className="rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-4 text-sm dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-emerald-800 dark:text-emerald-200/90">
            <AiMagicIcon size="sm" />
            Last JD-tailored answer (from Optimize)
          </div>
          <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-emerald-950 dark:text-emerald-50">
            {lastOpt.tailoredAnswer}
          </p>
          <Link
            href={`/optimize/application-question?baseId=${encodeURIComponent(doc.id)}`}
            className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-900 underline dark:text-emerald-200"
          >
            <AiMagicIcon size="sm" />
            Open Optimize to refresh
          </Link>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium">Display name</span>
          <input
            value={doc.title}
            onChange={(e) =>
              persist({ ...doc, title: e.target.value, updatedAt: Date.now() })
            }
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Job board</span>
          <select
            value={doc.source ?? ""}
            onChange={(e) =>
              persist({ ...doc, source: e.target.value, updatedAt: Date.now() })
            }
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          >
            {BOARD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-sm font-medium">
              Question / prompt (paste from the job form)
            </span>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUESTION_PRESETS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() =>
                persist({ ...doc, question: q, updatedAt: Date.now() })
              }
              className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted hover:bg-zinc-50 hover:text-foreground dark:hover:bg-zinc-800"
            >
              Use: {q.length > 42 ? `${q.slice(0, 40)}…` : q}
            </button>
          ))}
        </div>
        <textarea
          value={doc.question ?? ""}
          onChange={(e) =>
            persist({ ...doc, question: e.target.value, updatedAt: Date.now() })
          }
          rows={3}
          placeholder="e.g. Why are you interested in this role?"
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
        />
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Base template answer</span>
        <span className="text-xs text-zinc-500">
          Generic reusable draft. Optimize for a JD rewrites this into a
          posting-specific answer you can paste into the form.
        </span>
        <textarea
          value={doc.templateAnswer ?? ""}
          onChange={(e) =>
            persist({ ...doc, templateAnswer: e.target.value, updatedAt: Date.now() })
          }
          rows={12}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent"
          placeholder="Write a solid default answer grounded in your profile…"
        />
      </label>

      <p className="text-sm text-zinc-500">
        <Link href="/application-questions" className="underline">
          ← All Q&A templates
        </Link>
      </p>
    </div>
  );
}
