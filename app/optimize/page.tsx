import Link from "next/link";
import { FileText, Mail, MessageSquareText } from "lucide-react";
import { AiMagicIcon } from "../components/ai-magic-icon";

export default function OptimizeHubPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
          <AiMagicIcon size="lg" className="drop-shadow-sm" />
          Optimize for a job
        </h1>
        <p className="mt-1 text-sm text-muted">
          Pick a saved document from{" "}
          <Link href="/documents" className="font-medium text-accent underline underline-offset-2">
            Documents
          </Link>
          , then paste a job description. Nothing here replaces your base files — you
          can run this for every application.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Link
          href="/optimize/resume"
          className="group rounded-2xl border border-border bg-surface p-5 transition-all hover:border-border-hover hover:shadow-md"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-muted">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400">
              <FileText size={14} />
            </span>
            Resume
          </div>
          <div className="mt-3 text-lg font-semibold group-hover:text-accent transition-colors">
            Tailor a resume
          </div>
          <p className="mt-2 text-sm text-muted">
            Select a base resume, paste a JD, export LaTeX / PDF.
          </p>
        </Link>

        <Link
          href="/optimize/cover-letter"
          className="group rounded-2xl border border-border bg-surface p-5 transition-all hover:border-border-hover hover:shadow-md"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-muted">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-pink-100 text-pink-600 dark:bg-pink-950 dark:text-pink-400">
              <Mail size={14} />
            </span>
            Cover letter
          </div>
          <div className="mt-3 text-lg font-semibold group-hover:text-accent transition-colors">
            Tailor a cover letter
          </div>
          <p className="mt-2 text-sm text-muted">
            Select a base cover letter, paste a JD, copy or download output.
          </p>
        </Link>

        <Link
          href="/optimize/application-question"
          className="group rounded-2xl border border-border bg-surface p-5 transition-all hover:border-border-hover hover:shadow-md"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-muted">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 text-amber-600 dark:bg-amber-950 dark:text-amber-400">
              <MessageSquareText size={14} />
            </span>
            Application Q&A
          </div>
          <div className="mt-3 text-lg font-semibold group-hover:text-accent transition-colors">
            Tailor an answer
          </div>
          <p className="mt-2 text-sm text-muted">
            Pick a saved question template, paste a JD, get a posting-specific
            answer to paste into the form.
          </p>
        </Link>
      </div>
    </div>
  );
}
