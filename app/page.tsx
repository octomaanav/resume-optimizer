"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight, Check, FileText, Mail, MessageSquareText, Plus } from "lucide-react";
import { useWorkspace } from "./lib/workspace-context";
import { buttonPrimary, buttonSecondary } from "./components/ui";
import { formatListTimestamp } from "./lib/format-date";

const workflows = [
  { href: "/optimize/resume", title: "Resume", detail: "Select the experience that fits the role.", icon: FileText },
  { href: "/optimize/cover-letter", title: "Cover letter", detail: "Connect your experience to the company.", icon: Mail },
  { href: "/optimize/application-question", title: "Application answer", detail: "Give a specific, grounded response.", icon: MessageSquareText },
];

export default function Home() {
  const { workspace, profile, ready } = useWorkspace();
  const documents = [
    ...workspace.resumes.map(doc => ({ ...doc, kind: "Resume", href: `/resumes/${doc.id}`, icon: FileText })),
    ...workspace.coverLetters.map(doc => ({ ...doc, kind: "Cover letter", href: `/cover-letters/${doc.id}`, icon: Mail })),
    ...workspace.applicationAnswerDocs.map(doc => ({ ...doc, kind: "Application Q&A", href: `/application-questions/${doc.id}`, icon: MessageSquareText })),
  ].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
  const total = workspace.resumes.length + workspace.coverLetters.length + workspace.applicationAnswerDocs.length;
  const tasks = [
    { href: "/profile", title: "Build your source profile", detail: "Experience, projects, education, and skills.", complete: Boolean(profile.name && profile.experience.length) },
    { href: "/documents", title: "Create a base document", detail: "A starting point you can reuse for every role.", complete: total > 0 },
    { href: "/settings", title: "Choose your AI provider", detail: "Configure a hosted model or local Ollama.", complete: Boolean(workspace.settings.aiProvider === "ollama" || workspace.settings.aiProvider === "groq" || workspace.settings.geminiApiKey) },
  ];
  return <div>
    <div className="workbench-intro">
      <div>
        <p className="eyebrow mb-3">Application workbench</p>
        <h1 className="workbench-heading">Your next role starts here.</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">Keep your experience in one place. Shape it for the opportunity ahead.</p>
      </div>
      <Link href="/optimize" className={buttonPrimary}>Tailor an application <ArrowUpRight size={15} /></Link>
    </div>
    <div className="workbench-stats" aria-label="Workspace summary" aria-busy={!ready}>
      {[
        ["Experiences", profile.experience.length], ["Projects", profile.projects.length],
        ["Base documents", total], ["Education entries", profile.education.length],
      ].map(([label, count]) => <div className="workbench-stat" key={label}><strong>{ready ? String(count).padStart(2, "0") : "—"}</strong><span>{label}</span></div>)}
    </div>
    <div className="workbench-columns">
      <div>
        <div className="workbench-section-label"><h2>Recent documents</h2><Link href="/documents" className="text-xs font-normal text-muted hover:text-accent">View library <span aria-hidden>↗</span></Link></div>
        {!ready ? <p className="py-8 text-sm text-muted" role="status">Loading your workspace…</p> : documents.length ? documents.map(doc => <Link href={doc.href} key={`${doc.kind}-${doc.id}`} className="workbench-row">
          <span className="workbench-row-icon"><doc.icon size={18} /></span>
          <span className="min-w-0 flex-1"><span className="workbench-row-title block truncate text-sm font-medium">{doc.title}</span><span className="mt-1 block text-xs text-muted">{doc.kind} · Updated {formatListTimestamp(doc.updatedAt)}</span></span>
          <ArrowUpRight size={15} className="shrink-0 text-muted" />
        </Link>) : <div className="workbench-panel"><FileText size={24} className="text-muted mb-4" /><h3 className="text-sm">A home for your application documents.</h3><p className="mt-2 mb-5 text-sm text-muted leading-relaxed">Create your first base resume. Your tailored versions stay separate from the original.</p><Link href="/resumes/new" className={buttonSecondary}><Plus size={14} />Create a resume</Link></div>}
        <div className="mt-8 workbench-section-label"><h2>Tailor for a role</h2><span className="eyebrow text-[9px]">One job description at a time</span></div>
        {workflows.map(({ href, title, detail, icon: Icon }) => <Link href={href} key={href} className="workbench-row"><Icon size={17} className="shrink-0 text-muted" /><span className="flex-1 min-w-0"><span className="workbench-row-title text-sm font-medium">{title}</span><span className="block mt-1 text-xs text-muted">{detail}</span></span><ArrowRight size={15} className="text-muted shrink-0" /></Link>)}
      </div>
      <div>
        <section className="workbench-panel" aria-labelledby="foundation-title">
          <p className="eyebrow mb-3">The foundation</p><h2 id="foundation-title" className="text-lg font-medium">Good applications start<br className="hidden sm:block" /> with your actual work.</h2>
          <p className="mt-3 text-xs leading-relaxed text-muted">Build a complete profile, then choose what each application needs.</p>
          {tasks.map((task, index) => <Link href={task.href} key={task.href} className="workbench-task"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-mono ${ready && task.complete ? "border-accent text-accent bg-accent-light" : "border-border text-muted"}`}>{ready && task.complete ? <Check size={12} /> : index + 1}</span><span><span className="block text-xs font-medium">{task.title}</span><span className="block mt-1 text-xs leading-relaxed text-muted">{task.detail}</span></span></Link>)}
        </section>
        <p className="mt-4 px-1 text-xs leading-relaxed text-muted">Your profile is the source. Base documents are reusable. Every tailored application is its own draft.</p>
      </div>
    </div>
  </div>;
}
