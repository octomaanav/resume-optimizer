import Link from "next/link";
import { User, FolderOpen, Sparkles, Settings } from "lucide-react";

export default function Home() {
  return (
    <div className="font-sans">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 py-6">
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Resume + cover letter optimizer
          </h1>
          <p className="max-w-2xl text-base leading-relaxed text-muted">
            Store your profile and base documents once. Use Optimize with a job
            description when you apply — your saved templates stay separate.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/profile"
            className="group rounded-2xl border border-border bg-surface p-6 transition-all hover:border-border-hover hover:shadow-md"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-muted">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
                <User size={14} />
              </span>
              Step 1
            </div>
            <div className="mt-3 text-lg font-semibold group-hover:text-accent transition-colors">
              Set up your profile
            </div>
            <div className="mt-2 text-sm text-muted">
              Add experience, projects, education, and skills.
            </div>
          </Link>

          <Link
            href="/documents"
            className="group rounded-2xl border border-border bg-surface p-6 transition-all hover:border-border-hover hover:shadow-md"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-muted">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                <FolderOpen size={14} />
              </span>
              Step 2
            </div>
            <div className="mt-3 text-lg font-semibold group-hover:text-accent transition-colors">
              Create base documents
            </div>
            <div className="mt-2 text-sm text-muted">
              Resumes and cover letter templates you reuse across applications.
            </div>
          </Link>
        </div>

        <Link
          href="/optimize"
          className="group relative overflow-hidden rounded-2xl border border-accent/30 bg-gradient-to-br from-accent-light to-surface p-6 transition-all hover:border-accent/50 hover:shadow-md"
        >
          <div className="flex items-center gap-2 text-sm font-medium text-muted">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent/15 text-accent">
              <Sparkles size={14} />
            </span>
            When applying
          </div>
          <div className="mt-3 flex items-center gap-2 text-lg font-semibold group-hover:text-accent transition-colors">
            Optimize for a job
          </div>
          <div className="mt-2 text-sm text-muted">
            Paste a JD, tailor a resume or cover letter, export — without
            changing your base files.
          </div>
        </Link>

        <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface-raised p-5 text-sm text-muted">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
            <Settings size={14} />
          </span>
          <span>
            Tip: set your Gemini API key in{" "}
            <Link
              href="/settings"
              className="font-medium text-accent underline underline-offset-2"
            >
              Settings
            </Link>{" "}
            (stored locally in your browser).
          </span>
        </div>
      </main>
    </div>
  );
}
