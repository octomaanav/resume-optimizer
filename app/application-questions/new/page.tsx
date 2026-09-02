"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createApplicationAnswerDraft } from "../../lib/document-schemas";
import { useHydratedApplicationAnswerDocs } from "../../lib/use-hydrated-storage";

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

export default function NewApplicationQuestionPage() {
  const router = useRouter();
  const [docs, , ready, persistApplicationAnswerDocs] =
    useHydratedApplicationAnswerDocs();
  const [title, setTitle] = useState("why_this_company");
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setError(null);
    const name = title.trim();
    if (!name) {
      setError("Give this template a short name (e.g. why_this_company).");
      return;
    }

    const draft = { ...createApplicationAnswerDraft(name), source };
    const next = [draft, ...docs];
    await persistApplicationAnswerDocs(next);
    router.push(`/application-questions/${draft.id}`);
  }

  if (!ready) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          New Q&A template
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          You&apos;ll add the employer&apos;s exact question and your base
          answer on the next screen. Then use Optimize with a JD to tailor the
          answer for each application.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-100">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Template name</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="e.g. why_this_company"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Job board</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
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

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => void onCreate()}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-dark"
        >
          Create template
        </button>
      </div>
    </div>
  );
}
