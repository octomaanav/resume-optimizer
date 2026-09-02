"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { formatListTimestamp } from "../lib/format-date";
import { useHydratedApplicationAnswerDocs } from "../lib/use-hydrated-storage";
import { AiMagicIcon } from "../components/ai-magic-icon";

const BOARD_OPTIONS = [
  { id: "all", label: "All Boards" },
  { id: "ashby", label: "Ashby" },
  { id: "greenhouse", label: "Greenhouse" },
  { id: "lever", label: "Lever" },
  { id: "workday", label: "Workday" },
  { id: "workable", label: "Workable" },
  { id: "smartrecruiters", label: "SmartRecruiters" },
  { id: "icims", label: "iCIMS" },
  { id: "bamboohr", label: "BambooHR" },
  { id: "rippling", label: "Rippling" },
  { id: "other", label: "Other / Generic" },
];

const BOARD_LABELS: Record<string, string> = {
  ashby: "Ashby",
  greenhouse: "Greenhouse",
  lever: "Lever",
  workday: "Workday",
  workable: "Workable",
  smartrecruiters: "SmartRecruiters",
  icims: "iCIMS",
  bamboohr: "BambooHR",
  rippling: "Rippling",
  other: "Other / Generic",
};

function boardLabel(key: string) {
  return BOARD_LABELS[key] ?? (key ? key.charAt(0).toUpperCase() + key.slice(1) : "Other / Generic");
}

export default function ApplicationQuestionsPage() {
  const [docs, setDocs, storageReady, persistApplicationAnswerDocs] =
    useHydratedApplicationAnswerDocs();
  const [activeTab, setActiveTab] = useState("all");

  // Calculate count per board
  const counts = useMemo(() => {
    const map: Record<string, number> = { all: docs.length };
    for (const d of docs) {
      const k = (d.source || "").trim().toLowerCase() || "other";
      map[k] = (map[k] || 0) + 1;
    }
    return map;
  }, [docs]);

  // Group templates by originating job board
  const groups = useMemo(() => {
    const filteredDocs = activeTab === "all"
      ? docs
      : docs.filter((d) => ((d.source || "").trim().toLowerCase() || "other") === activeTab);

    const bySource = new Map<string, typeof docs>();
    for (const doc of filteredDocs) {
      const key = (doc.source || "").trim().toLowerCase() || "other";
      if (!bySource.has(key)) bySource.set(key, []);
      bySource.get(key)!.push(doc);
    }

    for (const list of bySource.values()) {
      list.sort((a, b) => b.updatedAt - a.updatedAt);
    }

    const order = [
      "ashby",
      "greenhouse",
      "lever",
      "workday",
      "workable",
      "smartrecruiters",
      "icims",
      "bamboohr",
      "rippling",
      "other",
    ];

    return [...bySource.entries()].sort(
      ([a], [b]) =>
        (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) -
        (order.indexOf(b) === -1 ? 99 : order.indexOf(b)),
    );
  }, [docs, activeTab]);

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
          <h1 className="text-2xl font-bold tracking-tight">
            Application Q&A
          </h1>
          <p className="mt-1 text-sm text-muted">
            One template per common question (exact prompt + reusable base answer).
            Questions are segregated by Job Board (Ashby, Greenhouse, Workday, etc.)
            so auto-fill fetches board-specific templates during application filing.
          </p>
        </div>
        <Link
          href="/application-questions/new"
          className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-dark"
        >
          <Plus size={14} />
          New template
        </Link>
      </div>

      {/* Job Board Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-3">
        {BOARD_OPTIONS.map((board) => {
          const count = counts[board.id] || 0;
          const isActive = activeTab === board.id;
          return (
            <button
              key={board.id}
              type="button"
              onClick={() => setActiveTab(board.id)}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? "bg-accent text-white shadow-sm"
                  : "bg-surface text-muted hover:bg-zinc-100 hover:text-foreground dark:hover:bg-zinc-800"
              }`}
            >
              <span>{board.label}</span>
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                  isActive
                    ? "bg-white/20 text-white"
                    : "bg-zinc-200/60 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          <p>
            {activeTab === "all"
              ? "No Q&A templates yet. Create one, paste the employer's question text, write a base answer, then run Optimize with each job's JD."
              : `No Q&A templates saved for ${boardLabel(activeTab)} yet.`}
          </p>
          <Link
            href="/application-questions/new"
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
          >
            <Plus size={13} /> Add question for {boardLabel(activeTab === "all" ? "other" : activeTab)}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(([source, list]) => (
            <section key={source} className="flex flex-col gap-3">
              <div className="flex items-center gap-2 border-b border-border/50 pb-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-foreground">
                  {boardLabel(source)}
                </h2>
                <span className="rounded-full bg-accent-light px-2 py-0.5 text-xs font-semibold text-accent">
                  {list.length} question{list.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid gap-3">
                {list.map((doc) => (
                  <div
                    key={doc.id}
                    className="rounded-2xl border border-border bg-surface p-4 transition-all hover:border-border-hover hover:shadow-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-base font-semibold">
                            {doc.title}
                          </span>
                          <span className="inline-block rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            {boardLabel(doc.source || "other")}
                          </span>
                        </div>
                        {doc.question?.trim() ? (
                          <div className="mt-1 line-clamp-2 text-xs text-muted">
                            {doc.question}
                          </div>
                        ) : null}
                        <div className="mt-1 text-xs text-muted">
                          Updated {formatListTimestamp(doc.updatedAt)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/application-questions/${doc.id}`}
                          className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        >
                          Edit template
                        </Link>
                        <Link
                          href={`/optimize/application-question?baseId=${encodeURIComponent(doc.id)}`}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-accent/30 bg-accent-light px-3 py-2 text-sm font-medium text-accent hover:bg-accent/15"
                        >
                          <AiMagicIcon size="sm" />
                          Optimize for JD
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            const next = docs.filter((d) => d.id !== doc.id);
                            setDocs(next);
                            void persistApplicationAnswerDocs(next);
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
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
