"use client";

import Link from "next/link";
import { useMemo } from "react";
import { FileText, Mail, MessageSquareText, Pencil, Plus } from "lucide-react";

import { formatListTimestamp } from "../lib/format-date";
import {
  useHydratedApplicationAnswerDocs,
  useHydratedCoverLetters,
  useHydratedResumes,
} from "../lib/use-hydrated-storage";
import { AiMagicIcon } from "../components/ai-magic-icon";
import { PageHeader } from "../components/ui";

type DocRow = { id: string; title: string; updatedAt: number };

/**
 * One document category. The three categories were previously ~50 lines of
 * duplicated markup each; the only real differences are the labels and routes.
 */
function DocumentColumn({
  icon,
  label,
  docs,
  editHref,
  optimizeHref,
  newHref,
  newLabel,
  emptyHint,
}: {
  icon: React.ReactNode;
  label: string;
  docs: DocRow[];
  editHref: (id: string) => string;
  optimizeHref: (id: string) => string;
  newHref: string;
  newLabel: string;
  emptyHint: string;
}) {
  return (
    <section className="flex flex-col rounded-xl border border-border bg-surface">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-light text-accent-dark">
          {icon}
        </span>
        <h2 className="text-sm font-semibold">{label}</h2>
        <span className="ml-auto rounded-full bg-surface-sunken px-2 py-0.5 font-mono text-[11px] text-muted">
          {docs.length}
        </span>
      </header>

      <div className="flex-1 p-3">
        {docs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-xs leading-relaxed text-muted">
            {emptyHint}
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className="group rounded-lg border border-border bg-surface-raised px-3 py-2.5 transition-colors hover:border-border-hover"
              >
                <div className="truncate text-sm font-medium" title={doc.title}>
                  {doc.title}
                </div>
                <div className="mt-0.5 text-[11px] text-faint">
                  Updated {formatListTimestamp(doc.updatedAt)}
                </div>
                <div className="mt-2 flex items-center gap-1.5">
                  <Link
                    href={editHref(doc.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs transition-colors hover:bg-surface-sunken"
                  >
                    <Pencil size={11} />
                    Edit
                  </Link>
                  <Link
                    href={optimizeHref(doc.id)}
                    className="inline-flex items-center gap-1 rounded-md bg-accent-light px-2 py-1 text-xs font-medium text-accent-dark transition-colors hover:bg-accent hover:text-on-accent"
                  >
                    <AiMagicIcon size="sm" />
                    Optimize
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="border-t border-border p-3">
        <Link
          href={newHref}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted transition-colors hover:border-accent hover:bg-accent-light hover:text-accent-dark"
        >
          <Plus size={13} />
          {newLabel}
        </Link>
      </footer>
    </section>
  );
}

export default function DocumentsPage() {
  const [resumes, , resumesReady] = useHydratedResumes();
  const [coverLetters, , lettersReady] = useHydratedCoverLetters();
  const [answerDocs, , answersReady] = useHydratedApplicationAnswerDocs();

  const byRecent = <T extends DocRow>(list: T[]) =>
    [...list].sort((a, b) => b.updatedAt - a.updatedAt);

  const sortedResumes = useMemo(() => byRecent(resumes), [resumes]);
  const sortedCL = useMemo(() => byRecent(coverLetters), [coverLetters]);
  const sortedQA = useMemo(() => byRecent(answerDocs), [answerDocs]);

  if (!resumesReady || !lettersReady || !answersReady) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        Loading documents…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Library"
        title="Documents"
        description={
          <>
            Base templates you reuse across applications. Tailoring in{" "}
            <Link
              href="/optimize"
              className="font-medium text-accent underline underline-offset-2"
            >
              Optimize
            </Link>{" "}
            never overwrites them.
          </>
        }
        actions={
          <Link
            href="/resumes/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
          >
            <Plus size={14} />
            New resume
          </Link>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <DocumentColumn
          icon={<FileText size={14} />}
          label="Resumes"
          docs={sortedResumes}
          editHref={(id) => `/resumes/${id}`}
          optimizeHref={(id) => `/optimize/resume?baseId=${encodeURIComponent(id)}`}
          newHref="/resumes/new"
          newLabel="New resume"
          emptyHint="No resumes yet. Create a base resume to reuse across applications — you can pick which roles from your profile it includes."
        />
        <DocumentColumn
          icon={<Mail size={14} />}
          label="Cover letters"
          docs={sortedCL}
          editHref={(id) => `/cover-letters/${id}`}
          optimizeHref={(id) =>
            `/optimize/cover-letter?baseId=${encodeURIComponent(id)}`
          }
          newHref="/cover-letters/new"
          newLabel="New cover letter"
          emptyHint="No cover letters yet. Write one base template, then tailor it per job."
        />
        <DocumentColumn
          icon={<MessageSquareText size={14} />}
          label="Application Q&A"
          docs={sortedQA}
          editHref={(id) => `/application-questions/${id}`}
          optimizeHref={(id) =>
            `/optimize/application-question?baseId=${encodeURIComponent(id)}`
          }
          newHref="/application-questions/new"
          newLabel="New template"
          emptyHint="No Q&A templates yet. Save each common application question once, then tailor the answer per posting."
        />
      </div>
    </div>
  );
}
