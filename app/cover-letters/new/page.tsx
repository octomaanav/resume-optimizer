"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createCoverLetterDraft } from "../../lib/document-schemas";
import { useHydratedCoverLetters } from "../../lib/use-hydrated-storage";

export default function NewCoverLetterPage() {
  const router = useRouter();
  const [docs, , ready, persistCoverLetters] = useHydratedCoverLetters();
  const [title, setTitle] = useState("manav_swe_cover_letter");
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setError(null);
    const name = title.trim();
    if (!name) {
      setError("Give this cover letter a name (e.g. manav_swe_cover_letter).");
      return;
    }

    const draft = createCoverLetterDraft(name);
    const next = [draft, ...docs];
    await persistCoverLetters(next);
    router.push(`/cover-letters/${draft.id}`);
  }

  if (!ready) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New cover letter</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Create a base template (persistent). Then use Optimize to tailor it for
          a specific job description.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-100">
          {error}
        </div>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Cover letter name</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="e.g. manav_swe_cover_letter"
        />
      </label>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => void onCreate()}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60 hover:bg-accent-dark"
        >
          Create cover letter
        </button>
      </div>
    </div>
  );
}
