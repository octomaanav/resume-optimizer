import Link from "next/link";
import {
  ArrowRight,
  FileText,
  FolderOpen,
  Mail,
  MessageSquareText,
  Settings,
  Sparkles,
  User,
} from "lucide-react";

const steps = [
  {
    href: "/profile",
    step: "01",
    title: "Build your profile",
    body: "Experience, projects, education and skills — the single source every document draws from.",
    icon: User,
  },
  {
    href: "/documents",
    step: "02",
    title: "Save base documents",
    body: "Resume and cover letter templates you reuse. Tailoring never overwrites them.",
    icon: FolderOpen,
  },
];

const shortcuts = [
  { href: "/optimize/resume", label: "Resume", icon: FileText },
  { href: "/optimize/cover-letter", label: "Cover letter", icon: Mail },
  {
    href: "/optimize/application-question",
    label: "Application Q&A",
    icon: MessageSquareText,
  },
];

export default function Home() {
  return (
    <div className="flex flex-col gap-6">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-xl border border-border bg-surface px-6 py-10 sm:px-10 sm:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent opacity-[0.07] blur-3xl"
        />
        <div className="relative max-w-2xl">
          <div className="eyebrow mb-3">Resume Optimizer</div>
          <h1 className="text-3xl sm:text-4xl">
            Tailor every application without rewriting from scratch.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted">
            Store your profile and base documents once. Paste a job description
            when you apply — the tailored output stays separate from your
            originals.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-2">
            <Link
              href="/optimize"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-on-accent transition-colors hover:bg-accent-hover"
            >
              <Sparkles size={15} />
              Optimize for a job
            </Link>
            <Link
              href="/profile"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-4 py-2.5 text-sm font-medium transition-colors hover:border-border-hover hover:bg-surface-sunken"
            >
              Set up profile
              <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </section>

      {/* Setup steps */}
      <div className="grid gap-4 sm:grid-cols-2">
        {steps.map(({ href, step, title, body, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent hover:bg-surface-raised"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-light text-accent-dark">
                <Icon size={15} />
              </span>
              <span className="font-mono text-xs text-faint">{step}</span>
            </div>
            <div className="mt-4 flex items-center gap-1.5 text-base font-semibold transition-colors group-hover:text-accent">
              {title}
              <ArrowRight
                size={14}
                className="opacity-0 transition-opacity group-hover:opacity-100"
              />
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
          </Link>
        ))}
      </div>

      {/* Jump straight in */}
      <section className="rounded-xl border border-border bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Jump straight in</h2>
            <p className="mt-1 text-xs text-muted">
              Already set up? Go directly to what you need to tailor.
            </p>
          </div>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-accent"
          >
            <Settings size={13} />
            Configure AI provider
          </Link>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {shortcuts.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-2.5 rounded-lg border border-border bg-surface-raised px-3.5 py-3 text-sm font-medium transition-colors hover:border-accent hover:bg-accent-light hover:text-accent-dark"
            >
              <Icon size={15} className="text-muted group-hover:text-accent" />
              {label}
              <ArrowRight
                size={14}
                className="ml-auto opacity-0 transition-opacity group-hover:opacity-100"
              />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
