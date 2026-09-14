"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildAiHeaders } from "../../lib/ai-client";
import type { ApplicationAnswerDoc } from "../../lib/document-schemas";
import {
  useHydratedApplicationAnswerDocs,
  useHydratedProfile,
  useHydratedSettings,
  useWorkspaceOptimizations,
} from "../../lib/use-hydrated-storage";
import { WandSparkles } from 'lucide-react';
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

export default function OptimizeApplicationQuestionPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      }
    >
      <OptimizeApplicationQuestionInner />
    </Suspense>
  );
}

function OptimizeApplicationQuestionInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const baseId = sp.get("baseId") ?? "";

  const [profile] = useHydratedProfile();
  const [settings] = useHydratedSettings();
  const [docs, , ready] = useHydratedApplicationAnswerDocs();
  const { applicationAnswerOptimizations, patchApplicationAnswerOptimizations } =
    useWorkspaceOptimizations();
  const sortedDocs = useMemo(
    () => [...docs].sort((a, b) => b.updatedAt - a.updatedAt),
    [docs]
  );
  const baseDoc = useMemo(
    () => docs.find((d) => d.id === baseId) ?? null,
    [docs, baseId]
  );

  const [jd, setJd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tailoredAnswer, setTailoredAnswer] = useState("");
  const [optModal, setOptModal] = useState<{
    before: string;
    after: string;
  } | null>(null);

  // Hydrate once per baseId (keyed by createdAt, stable across a session) —
  // not on every reference change of applicationAnswerOptimizations, which
  // happens on unrelated workspace refreshes and would otherwise clobber an
  // in-progress hand-edit to the tailored answer.
  const lastHydrateKey = useRef<string>("");
  useEffect(() => {
    if (!ready || !baseId) return;
    const opt = applicationAnswerOptimizations[baseId];
    if (!opt) return;
    const key = `${baseId}:${opt.createdAt}`;
    if (lastHydrateKey.current === key) return;
    lastHydrateKey.current = key;

    setJd(opt.jd);
    setTailoredAnswer(opt.tailoredAnswer ?? "");
  }, [ready, baseId, applicationAnswerOptimizations]);

  async function onOptimize() {
    setError(null);
    if (!baseDoc) {
      setError("Base template not found.");
      return;
    }
    if (!profile.name.trim()) {
      setError("Add your name in Profile before optimizing.");
      return;
    }
    if (!baseDoc.question.trim()) {
      setError(
        "This template has no question text yet. Edit the template and paste the employer prompt."
      );
      return;
    }
    if (!jd.trim()) {
      setError("Paste a job description first so the answer can be tailored.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: buildAiHeaders(settings),
        body: JSON.stringify({
          kind: "applicationAnswer",
          profile,
          jd,
          skillsMd: settings.skillsMd ?? "",
          personalContext: settings.personalContext ?? "",
          applicationQuestion: baseDoc.question,
          draftAnswer: baseDoc.templateAnswer ?? "",
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }

      const data = (await res.json()) as { optimizedAnswer?: string };
      const next = (data.optimizedAnswer ?? "").trim();
      if (!next) throw new Error("Empty response from model.");

      const prevAnswer = tailoredAnswer || baseDoc.templateAnswer || "(no previous output)";
      setOptModal({ before: prevAnswer, after: next });
      setTailoredAnswer(next);

      const map = {
        ...applicationAnswerOptimizations,
        [baseId]: {
          baseApplicationAnswerId: baseId,
          jd,
          createdAt: Date.now(),
          tailoredAnswer: next,
        },
      };
      await patchApplicationAnswerOptimizations(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
    );
  }

  if (!baseDoc) {
    if (!baseId) {
      return (
        <div className="mx-auto flex max-w-lg flex-col gap-8">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <WandSparkles size={20} className="shrink-0 drop-shadow-sm" />
              Tailor an answer
            </h1>
            <p className="mt-2 text-sm text-muted">
              Pick a saved Q&A template to optimize for a job description.
            </p>
          </div>
          {sortedDocs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
              No templates yet.{" "}
              <Link href="/application-questions/new" className="font-medium text-accent underline underline-offset-2">
                Create one
              </Link>{" "}
              or go to{" "}
              <Link href="/application-questions" className="font-medium text-accent underline underline-offset-2">
                Q&A templates
              </Link>
              .
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sortedDocs.map((d: ApplicationAnswerDoc) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() =>
                    router.push(
                      `/optimize/application-question?baseId=${encodeURIComponent(d.id)}`
                    )
                  }
                  className="group flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3.5 text-left transition-all hover:border-accent/40 hover:shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-light text-accent">
                      <WandSparkles size={14} />
                    </span>
                    <span className="text-sm font-medium group-hover:text-accent transition-colors">{d.title}</span>
                  </div>
                  <span className="text-xs text-muted">Select</span>
                </button>
              ))}
              <Link
                href="/application-questions"
                className="mt-2 text-center text-xs text-muted hover:text-foreground"
              >
                Manage templates
              </Link>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="text-sm text-zinc-600 dark:text-zinc-300">
        Missing or invalid <code className="font-mono text-xs">baseId</code>.
        Pick a template from{" "}
        <Link href="/application-questions" className="underline">
          Application Q&A
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
            <WandSparkles size={20} className="shrink-0 drop-shadow-sm" />
            Optimize: {baseDoc.title}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Paste a JD to tailor your base answer. The template on file is not
            modified.
          </p>
        </div>
        <button
          type="button"
          onClick={onOptimize}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60 hover:bg-accent-dark"
        >
          <WandSparkles
            size={16}
            className="shrink-0 brightness-125 dark:brightness-100"
          />
          {busy ? "Optimizing…" : "Tailor to JD"}
        </button>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900/40">
        <div className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Template question
        </div>
        <p className="mt-2 whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
          {baseDoc.question.trim() || "— (add question text in the template)"}
        </p>
        <Link
          href={`/application-questions/${baseDoc.id}`}
          className="mt-3 inline-block text-xs text-zinc-500 underline"
        >
          Edit template
        </Link>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-100">
          {error}
        </div>
      ) : null}
      {toast ? (
        <p className="text-sm text-emerald-800 dark:text-emerald-200">{toast}</p>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Job description</span>
        <textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          rows={10}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent dark:bg-zinc-950"
          placeholder="Paste the full JD or the most relevant sections…"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">JD-tailored answer</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              downloadText(
                `${(baseDoc.title || "answer").replaceAll("/", "-")}-tailored.txt`,
                tailoredAnswer
              )
            }
            disabled={!tailoredAnswer.trim()}
            className="rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Download .txt
          </button>
          <button
            type="button"
            onClick={async () => {
              if (!tailoredAnswer.trim()) return;
              await copyToClipboard(tailoredAnswer);
              setToast("Copied.");
              setTimeout(() => setToast(null), 1200);
            }}
            disabled={!tailoredAnswer.trim()}
            className="rounded-xl border border-border px-3 py-2 text-sm disabled:opacity-40 hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Copy
          </button>
        </div>
      </div>
      <textarea
        value={tailoredAnswer}
        onChange={(e) => setTailoredAnswer(e.target.value)}
        rows={16}
        className="rounded-2xl border border-border bg-surface px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent dark:bg-zinc-950"
        placeholder="Run Tailor to JD to generate text here…"
      />

      <p className="text-sm text-zinc-500">
        <Link href="/optimize" className="underline">
          ← Optimize hub
        </Link>
      </p>

      {optModal ? (
        <OptimizationModal
          open
          title="Answer optimization"
          before={optModal.before}
          after={optModal.after}
          onAccept={() => setOptModal(null)}
          onRevert={() => {
            setTailoredAnswer(optModal.before);
            setOptModal(null);
          }}
          onReoptimize={() => {
            setOptModal(null);
            void onOptimize();
          }}
          onClose={() => setOptModal(null)}
          busy={busy}
        />
      ) : null}
    </div>
  );
}
