"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { buildAiHeaders } from "../../lib/ai-client";
import {
  useHydratedCoverLetters,
  useHydratedProfile,
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

export default function OptimizeCoverLetterPage() {
  return (
    <Suspense
      fallback={
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
      }
    >
      <OptimizeCoverLetterInner />
    </Suspense>
  );
}

function OptimizeCoverLetterInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const baseId = sp.get("baseId") ?? "";

  const [profile] = useHydratedProfile();
  const [settings] = useHydratedSettings();
  const [letters, , ready] = useHydratedCoverLetters();
  const { coverLetterOptimizations, patchCoverLetterOptimizations } =
    useWorkspaceOptimizations();
  const baseDoc = useMemo(
    () => letters.find((d) => d.id === baseId) ?? null,
    [letters, baseId]
  );

  const [jd, setJd] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputMarkdown, setOutputMarkdown] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [optModal, setOptModal] = useState<{
    before: string;
    after: string;
  } | null>(null);

  // Hydrate once per baseId (keyed by createdAt, stable across a session) —
  // not on every reference change of coverLetterOptimizations, which happens
  // on unrelated workspace refreshes and would otherwise clobber in-progress
  // hand-edits to the tailored letter.
  const lastHydrateKey = useRef<string>("");
  useEffect(() => {
    if (!ready || !baseId) return;
    const opt = coverLetterOptimizations[baseId];
    if (!opt) return;
    const key = `${baseId}:${opt.createdAt}`;
    if (lastHydrateKey.current === key) return;
    lastHydrateKey.current = key;

    setJd(opt.jd);
    setOutputMarkdown(opt.outputMarkdown ?? "");
    setCompanyName(opt.companyName ?? "");
  }, [ready, baseId, coverLetterOptimizations]);

  async function onOptimize() {
    setError(null);
    if (!baseDoc) {
      setError("Base cover letter not found.");
      return;
    }
    if (!profile.name.trim()) {
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
          kind: "coverLetter",
          profile,
          jd,
          skillsMd: settings.skillsMd ?? "",
          coverLetterTemplate: baseDoc.templateMarkdown ?? "",
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Request failed (${res.status})`);
      }

      const data = (await res.json()) as {
        companyName?: string;
        outputMarkdown: string;
      };

      const prevOutput = outputMarkdown;
      const newOutput = data.outputMarkdown ?? "";
      setCompanyName(data.companyName ?? "");

      setOptModal({
        before: prevOutput || baseDoc.templateMarkdown || "(no previous output)",
        after: newOutput,
      });
      setOutputMarkdown(newOutput);

      const map = {
        ...coverLetterOptimizations,
        [baseId]: {
          baseCoverLetterId: baseId,
          jd,
          createdAt: Date.now(),
          companyName: data.companyName ?? "",
          outputMarkdown: newOutput,
        },
      };
      await patchCoverLetterOptimizations(map);
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
      const sorted = [...letters].sort((a, b) => b.updatedAt - a.updatedAt);
      return (
        <div className="mx-auto flex max-w-lg flex-col gap-8">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <AiMagicIcon size="lg" className="drop-shadow-sm" />
              Tailor a cover letter
            </h1>
            <p className="mt-2 text-sm text-muted">
              Pick a base cover letter to optimize for a job description.
            </p>
          </div>
          {sorted.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
              No cover letters yet.{" "}
              <Link href="/cover-letters/new" className="font-medium text-accent underline underline-offset-2">
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
                      `/optimize/cover-letter?baseId=${encodeURIComponent(doc.id)}`
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
        Pick a base cover letter from{" "}
        <Link href="/documents" className="underline">
          Documents
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
            <AiMagicIcon size="lg" className="drop-shadow-sm" />
            Optimize: {baseDoc.title}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Paste a JD to generate a tailored letter. Your base template in
            Documents stays unchanged.
          </p>
        </div>
        <button
          type="button"
          onClick={onOptimize}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60 hover:bg-accent-dark"
        >
          <AiMagicIcon size="md" className="brightness-125 dark:brightness-100" />
          {busy ? "Optimizing…" : "Optimize"}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-100">
          {error}
        </div>
      ) : null}

      {companyName ? (
        <div className="text-sm text-zinc-600 dark:text-zinc-300">
          Detected company:{" "}
          <span className="font-medium text-zinc-900 dark:text-zinc-100">
            {companyName}
          </span>
        </div>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Job description</span>
        <textarea
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          rows={10}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent dark:bg-zinc-950"
          placeholder="Paste the JD here…"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">Tailored output (Markdown)</div>
        <button
          type="button"
          onClick={() =>
            downloadText(
              `${(baseDoc.title || "cover-letter").replaceAll("/", "-")}-tailored.md`,
              outputMarkdown
            )
          }
          className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          Download .md
        </button>
      </div>
      <textarea
        value={outputMarkdown}
        onChange={(e) => setOutputMarkdown(e.target.value)}
        rows={18}
        className="rounded-2xl border border-border bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-accent dark:bg-zinc-950"
        placeholder="Run Optimize to generate text here…"
      />

      {optModal ? (
        <OptimizationModal
          open
          title="Cover letter optimization"
          before={optModal.before}
          after={optModal.after}
          onAccept={() => setOptModal(null)}
          onRevert={() => {
            setOutputMarkdown(optModal.before);
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
