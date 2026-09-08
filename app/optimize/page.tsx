import Link from "next/link";
import { ArrowRight, FileText, Mail, MessageSquareText } from "lucide-react";

import { PageHeader } from "../components/ui";

const targets = [
  {
    href: "/optimize/resume",
    icon: FileText,
    kicker: "Resume",
    title: "Tailor a resume",
    body: "Pick a base resume, paste the JD, and get reordered picks plus rewritten bullets. Export LaTeX or PDF.",
    steps: ["Select base", "Paste JD", "Review bullets", "Export"],
  },
  {
    href: "/optimize/cover-letter",
    icon: Mail,
    kicker: "Cover letter",
    title: "Tailor a cover letter",
    body: "Start from a saved template and rewrite it against the posting. Copy or download the result.",
    steps: ["Select base", "Paste JD", "Copy output"],
  },
  {
    href: "/optimize/application-question",
    icon: MessageSquareText,
    kicker: "Application Q&A",
    title: "Tailor an answer",
    body: "Pick a saved question template and get a posting-specific answer sized to the form's limit.",
    steps: ["Pick question", "Paste JD", "Paste answer"],
  },
];

export default function OptimizeHubPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="When you apply"
        title="Optimize for a job"
        description={
          <>
            Nothing here replaces your base files — run it once per application.
            Templates live in{" "}
            <Link
              href="/documents"
              className="font-medium text-accent underline underline-offset-2"
            >
              Documents
            </Link>
            .
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {targets.map(({ href, icon: Icon, kicker, title, body, steps }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col rounded-xl border border-border bg-surface p-5 transition-colors hover:border-accent hover:bg-surface-raised"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-light text-accent-dark">
                <Icon size={15} />
              </span>
              <span className="eyebrow">{kicker}</span>
            </div>

            <div className="mt-4 flex items-center gap-1.5 text-base font-semibold transition-colors group-hover:text-accent">
              {title}
              <ArrowRight
                size={14}
                className="opacity-0 transition-opacity group-hover:opacity-100"
              />
            </div>
            <p className="mt-1.5 flex-1 text-sm leading-relaxed text-muted">
              {body}
            </p>

            <ol className="mt-4 flex flex-wrap items-center gap-1 border-t border-border pt-3 text-[11px] text-faint">
              {steps.map((s, i) => (
                <li key={s} className="flex items-center gap-1">
                  {i > 0 && <span aria-hidden>·</span>}
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </Link>
        ))}
      </div>
    </div>
  );
}
