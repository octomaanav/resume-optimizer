"use client";

import Link from "next/link";
import { useMemo } from "react";
import { FileText, Mail, MessageSquareText, Plus, Pencil } from "lucide-react";
import { formatListTimestamp } from "../lib/format-date";
import {
  useHydratedApplicationAnswerDocs,
  useHydratedCoverLetters,
  useHydratedResumes,
} from "../lib/use-hydrated-storage";
import { AiMagicIcon } from "../components/ai-magic-icon";

export default function DocumentsPage() {
  const [resumes, , resumesReady] = useHydratedResumes();
  const [coverLetters, , lettersReady] = useHydratedCoverLetters();
  const [answerDocs, , answersReady] = useHydratedApplicationAnswerDocs();

  const sortedResumes = useMemo(
    () => [...resumes].sort((a, b) => b.updatedAt - a.updatedAt),
    [resumes]
  );
  const sortedCL = useMemo(
    () => [...coverLetters].sort((a, b) => b.updatedAt - a.updatedAt),
    [coverLetters]
  );
  const sortedQA = useMemo(
    () => [...answerDocs].sort((a, b) => b.updatedAt - a.updatedAt),
    [answerDocs]
  );

  if (!resumesReady || !lettersReady || !answersReady) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        Loading documents...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
        <p className="mt-1 text-sm text-muted">
          Persistent resume, cover letter, and application Q&A templates. Use{" "}
          <Link
            href="/optimize"
            className="inline-flex items-center gap-1 font-medium text-accent underline underline-offset-2"
          >
            <AiMagicIcon size="sm" />
            Optimize
          </Link>{" "}
          to tailor outputs for a specific job description.
        </p>
      </div>

      <div className="rounded-2xl border border-sky-200/80 bg-gradient-to-br from-sky-50 to-white p-5 dark:border-sky-900/40 dark:from-sky-950/30 dark:to-surface">
        <div className="font-semibold text-sky-900 dark:text-sky-100">
          Targeted resumes from your profile
        </div>
        <p className="mt-1.5 text-sm text-sky-800/80 dark:text-sky-200/80">
          With many roles in Profile, open any resume and enable{" "}
          <span className="font-medium">Pick from profile</span> to check only
          the jobs you want. Use <span className="font-medium">Customize</span>{" "}
          to change wording for that resume only, or the{" "}
          <span className="font-medium">LaTeX</span> tab for raw{" "}
          <code className="rounded bg-sky-100/80 px-1 text-xs dark:bg-sky-900/40">
            .tex
          </code>{" "}
          and PDF compile.
        </p>
        <Link
          href="/resumes/new"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-500 dark:bg-sky-500 dark:hover:bg-sky-400"
        >
          <Plus size={14} />
          New resume (optional profile picks)
        </Link>
      </div>

      {/* Resumes */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <FileText size={18} className="text-muted" />
            Resumes
          </h2>
          <Link
            href="/resumes/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-dark"
          >
            <Plus size={14} />
            New resume
          </Link>
        </div>
        {sortedResumes.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
            No resumes yet. Create a base resume to reuse across applications.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedResumes.map((doc) => (
              <li
                key={doc.id}
                className="group flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3 transition-all hover:border-border-hover hover:shadow-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{doc.title}</div>
                  <div className="text-xs text-muted">
                    Updated {formatListTimestamp(doc.updatedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/resumes/${doc.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <Pencil size={12} />
                    Edit
                  </Link>
                  <Link
                    href={`/optimize/resume?baseId=${encodeURIComponent(doc.id)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent-light px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/15"
                  >
                    <AiMagicIcon size="sm" />
                    Optimize
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Cover letters */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Mail size={18} className="text-muted" />
            Cover letters
          </h2>
          <Link
            href="/cover-letters/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-dark"
          >
            <Plus size={14} />
            New cover letter
          </Link>
        </div>
        {sortedCL.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
            No cover letters yet. Create a base template, then optimize per job.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedCL.map((doc) => (
              <li
                key={doc.id}
                className="group flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3 transition-all hover:border-border-hover hover:shadow-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{doc.title}</div>
                  <div className="text-xs text-muted">
                    Updated {formatListTimestamp(doc.updatedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/cover-letters/${doc.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <Pencil size={12} />
                    Edit
                  </Link>
                  <Link
                    href={`/optimize/cover-letter?baseId=${encodeURIComponent(doc.id)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent-light px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/15"
                  >
                    <AiMagicIcon size="sm" />
                    Optimize
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Q&A */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <MessageSquareText size={18} className="text-muted" />
            Application Q&A
          </h2>
          <Link
            href="/application-questions/new"
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-dark"
          >
            <Plus size={14} />
            New template
          </Link>
        </div>
        {sortedQA.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
            No Q&A templates yet. Save each common application question once,
            then optimize per job with a JD.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {sortedQA.map((doc) => (
              <li
                key={doc.id}
                className="group flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-surface px-4 py-3 transition-all hover:border-border-hover hover:shadow-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{doc.title}</div>
                  <div className="text-xs text-muted">
                    Updated {formatListTimestamp(doc.updatedAt)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/application-questions/${doc.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <Pencil size={12} />
                    Edit
                  </Link>
                  <Link
                    href={`/optimize/application-question?baseId=${encodeURIComponent(doc.id)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 bg-accent-light px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/15"
                  >
                    <AiMagicIcon size="sm" />
                    Optimize
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
