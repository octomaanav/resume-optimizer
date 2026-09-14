"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { CoverLetterDoc } from "../../lib/document-schemas";
import {
  useHydratedCoverLetters,
  useWorkspaceOptimizations,
} from "../../lib/use-hydrated-storage";
import { AiMagicIcon } from "../../components/ai-magic-icon";

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CoverLetterDetailPage() {
  const params = useParams();
  const id = String(params.id);

  const [docs, setDocs, storageReady, persistCoverLetters] =
    useHydratedCoverLetters();
  const { coverLetterOptimizations } = useWorkspaceOptimizations();
  const doc = useMemo(
    () => docs.find((d) => d.id === id) ?? null,
    [docs, id]
  );

  const lastOpt = useMemo(() => {
    return coverLetterOptimizations[id] ?? null;
  }, [coverLetterOptimizations, id]);

  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState("");
  const hydrateFromDoc = useCallback((d: CoverLetterDoc) => {
    setTitle(d.title);
    setTemplate(d.templateMarkdown ?? "");
  }, []);

  // Re-hydrate local edit state only when the doc actually changes underneath
  // us (id swap, or a fresh save) — not on every reference change, which
  // would otherwise clobber whatever the user is currently typing.
  const lastHydrateKey = useRef<string>("");
  useEffect(() => {
    if (!doc) return;
    const key = `${doc.id}:${doc.updatedAt}`;
    if (lastHydrateKey.current === key) return;
    lastHydrateKey.current = key;
    // Same guarded re-hydrate-on-identity-change pattern as resumes/[id]/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    hydrateFromDoc(doc);
  }, [doc, hydrateFromDoc]);

  function persist(nextDoc: CoverLetterDoc) {
    const next = docs.map((d) => (d.id === nextDoc.id ? nextDoc : d));
    setDocs(next);
    void persistCoverLetters(next);
  }

  if (!storageReady) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
    );
  }

  if (!doc) {
    return (
      <div className="text-sm text-zinc-600 dark:text-zinc-300">
        Cover letter not found.
      </div>
    );
  }

  const tailoredPreview =
    lastOpt?.outputMarkdown?.trim() || doc.outputMarkdown?.trim() || "";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {doc.title}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Base cover letter template. Use Optimize to tailor it for a specific
            job.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/optimize/cover-letter?baseId=${encodeURIComponent(doc.id)}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-accent/30 bg-accent-light px-3 py-2 text-sm font-medium text-accent hover:bg-accent/15"
          >
            <AiMagicIcon size="sm" />
            Optimize for JD
          </Link>
          <button
            type="button"
            onClick={() =>
              downloadText(
                `${(doc.title || "cover-letter").replaceAll("/", "-")}-base.md`,
                template
              )
            }
            className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Download base .md
          </button>
          <button
            type="button"
            onClick={() => {
              const nextDoc: CoverLetterDoc = {
                ...doc,
                title: title.trim() || doc.title,
                templateMarkdown: template,
                updatedAt: Date.now(),
              };
              persist(nextDoc);
            }}
            className="rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-dark"
          >
            Save
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="text-sm font-semibold">Meta</div>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-600 dark:text-zinc-300">
              Title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>

          <div className="rounded-2xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <div className="flex items-center gap-2 font-semibold">
              <AiMagicIcon size="sm" />
              Last optimized run
            </div>
            {lastOpt ? (
              <div className="mt-2 space-y-1 text-zinc-600 dark:text-zinc-300">
                {lastOpt.companyName ? (
                  <div>
                    Company:{" "}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {lastOpt.companyName}
                    </span>
                  </div>
                ) : null}
                <div className="text-xs text-zinc-500">
                  JD length: {lastOpt.jd.length} characters (stored with
                  optimization).
                </div>
              </div>
            ) : (
              <div className="mt-2 text-zinc-600 dark:text-zinc-300">
                None yet — use Optimize for a JD.
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="text-sm font-semibold">Base template (Markdown)</div>
          <textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            rows={14}
            className="rounded-2xl border border-border bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-accent"
            placeholder="Write or paste a starting cover letter. The optimizer will tailor it per job."
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-2 text-sm font-semibold">
            <AiMagicIcon size="sm" />
            Tailored output (from Optimize)
          </div>
          {tailoredPreview ? (
            <button
              type="button"
              onClick={() =>
                downloadText(
                  `${(doc.title || "cover-letter").replaceAll("/", "-")}-tailored.md`,
                  tailoredPreview
                )
              }
              className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              Download tailored .md
            </button>
          ) : null}
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm whitespace-pre-wrap text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200">
          {tailoredPreview ? tailoredPreview : "(Run Optimize to generate.)"}
        </div>
      </div>
    </div>
  );
}
