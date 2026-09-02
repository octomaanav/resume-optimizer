"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatListTimestamp } from "../lib/format-date";
import { useHydratedCoverLetters } from "../lib/use-hydrated-storage";
import { AiMagicIcon } from "../components/ai-magic-icon";

export default function CoverLettersPage() {
  const [docs, setDocs, storageReady, persistCoverLetters] =
    useHydratedCoverLetters();

  const sorted = useMemo(() => {
    return [...docs].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [docs]);

  if (!storageReady) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cover letters</h1>
          <p className="mt-1 text-sm text-muted">
            Base templates live here and in{" "}
            <Link href="/documents" className="font-medium text-accent underline underline-offset-2">
              Documents
            </Link>
            . Use{" "}
            <Link
              href="/optimize"
              className="inline-flex items-center gap-1 font-medium text-accent underline underline-offset-2"
            >
              <AiMagicIcon size="sm" />
              Optimize
            </Link>{" "}
            per application.
          </p>
        </div>
        <Link
          href="/cover-letters/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-dark"
        >
          <Plus size={14} />
          New cover letter
        </Link>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          No saved cover letters yet.
        </div>
      ) : (
        <div className="grid gap-3">
          {sorted.map((doc) => (
            <div
              key={doc.id}
              className="rounded-2xl border border-border bg-surface p-4 transition-all hover:border-border-hover hover:shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">
                    {doc.title}
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    Updated {formatListTimestamp(doc.updatedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/cover-letters/${doc.id}`}
                    className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    Open
                  </Link>
                  <Link
                    href={`/optimize/cover-letter?baseId=${encodeURIComponent(doc.id)}`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-accent/30 bg-accent-light px-3 py-2 text-sm font-medium text-accent hover:bg-accent/15"
                  >
                    <AiMagicIcon size="sm" />
                    Optimize
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      const next = docs.filter((d) => d.id !== doc.id);
                      setDocs(next);
                      void persistCoverLetters(next);
                    }}
                    className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm text-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                  >
                    <Trash2 size={13} />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
