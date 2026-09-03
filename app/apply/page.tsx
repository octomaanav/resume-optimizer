"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, ChevronRight, FileText, RotateCcw, Send, Terminal, UserCheck } from "lucide-react";
import {
  ACTIVITY_LOG_EVENT,
  getActivityLog,
  type ActivityLogEntry,
} from "../lib/webmcp/activity-log-store";
import {
  APPLY_FORM_EVENT,
  getApplyFormState,
  resetApplyForm,
  setApplyFormField,
  submitApplyForm,
  type ApplyFormField,
  type ApplyFormState,
} from "../lib/webmcp/apply-form-store";
import { WEBMCP_PDF_EVENT } from "../components/webmcp-provider";
import { AgentChat } from "./agent-chat";
import { ToolConsole } from "./tool-console";

function latestDone(log: ActivityLogEntry[], tool: string): ActivityLogEntry | null {
  return log.find((e) => e.tool === tool && e.status === "done") ?? null;
}

type TextField = { key: ApplyFormField; label: string; placeholder: string; required?: boolean };

const NAME_FIELDS: TextField[] = [
  { key: "firstName", label: "First name", placeholder: "Jane", required: true },
  { key: "lastName", label: "Last name", placeholder: "Doe", required: true },
];

const CONTACT_FIELDS: TextField[] = [
  { key: "email", label: "Email", placeholder: "jane@example.com", required: true },
  { key: "phone", label: "Phone", placeholder: "555-0100" },
];

const QUESTION_FIELDS: TextField[] = [
  {
    key: "whyThisRole",
    label: "Why are you interested in this role?",
    placeholder: "Run answer_application_question, then fill_application_field to place it here…",
    required: true,
  },
  {
    key: "relevantProject",
    label: "Tell us about a project you're proud of",
    placeholder: "Run answer_application_question, then fill_application_field to place it here…",
  },
];

const ACCEPTED_FILE_TYPES = "Accepted file types: pdf, doc, docx, txt, rtf";

const SELECT_CLS =
  "rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent";

function SectionLabel({
  children,
  as: Tag = "h3",
}: {
  children: React.ReactNode;
  as?: "h3" | "summary";
}) {
  return (
    <Tag className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-muted">
      <span className="text-foreground/35">{"//"}</span>
      {children}
    </Tag>
  );
}

function FieldInput({
  field,
  justFilled,
  multiline,
}: {
  field: TextField;
  justFilled: ApplyFormField | null;
  multiline?: boolean;
}) {
  const state = getApplyFormState();
  const highlighted = justFilled === field.key;
  const cls = `rounded-lg border bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-accent ${
    highlighted ? "border-accent ring-2 ring-accent/30" : "border-border"
  }`;
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">
        {field.label}
        {field.required ? <span className="text-red-400"> *</span> : null}
      </span>
      {multiline ? (
        <textarea
          value={state.values[field.key]}
          onChange={(e) => setApplyFormField(field.key, e.target.value)}
          placeholder={field.placeholder}
          rows={4}
          className={cls}
        />
      ) : (
        <input
          value={state.values[field.key]}
          onChange={(e) => setApplyFormField(field.key, e.target.value)}
          placeholder={field.placeholder}
          className={cls}
        />
      )}
      {highlighted ? (
        <span className="font-mono text-xs font-medium text-accent">Filled by agent</span>
      ) : null}
    </label>
  );
}

export default function ApplyPage() {
  const [state, setState] = useState<ApplyFormState>(() => getApplyFormState());
  const [justFilled, setJustFilled] = useState<ApplyFormField | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState<{ title: string } | null>(null);
  const [country, setCountry] = useState("United States");
  const [city, setCity] = useState("");
  const [workAuth, setWorkAuth] = useState("Yes");
  const [sponsorship, setSponsorship] = useState("No");
  const [nonCompete, setNonCompete] = useState("No");
  const [relocate, setRelocate] = useState("Yes");
  const [heardAbout, setHeardAbout] = useState("");
  const [heardAboutOther, setHeardAboutOther] = useState("");
  const [aiAcknowledged, setAiAcknowledged] = useState(false);
  const [log, setLog] = useState<ActivityLogEntry[]>(() => getActivityLog());

  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent<ApplyFormState>).detail;
      setState(detail);
      if (detail.lastFilledField) {
        setJustFilled(detail.lastFilledField);
        const t = setTimeout(() => setJustFilled(null), 1500);
        return () => clearTimeout(t);
      }
    }
    function onPdf(e: Event) {
      const detail = (e as CustomEvent<{ title: string; url: string }>).detail;
      setResume({ title: detail.title });
    }
    function onLog(e: Event) {
      setLog((e as CustomEvent<ActivityLogEntry[]>).detail);
    }
    window.addEventListener(APPLY_FORM_EVENT, onChange as EventListener);
    window.addEventListener(WEBMCP_PDF_EVENT, onPdf as EventListener);
    window.addEventListener(ACTIVITY_LOG_EVENT, onLog as EventListener);
    return () => {
      window.removeEventListener(APPLY_FORM_EVENT, onChange as EventListener);
      window.removeEventListener(WEBMCP_PDF_EVENT, onPdf as EventListener);
      window.removeEventListener(ACTIVITY_LOG_EVENT, onLog as EventListener);
    };
  }, []);

  const profileCheck = latestDone(log, "get_profile");
  const docsCheck = latestDone(log, "list_documents");
  const resumeTailored = latestDone(log, "optimize_resume");
  const coverLetter = latestDone(log, "optimize_cover_letter");

  function onSubmit() {
    setError(null);
    const result = submitApplyForm();
    if (!result.ok) {
      setError(`Please complete required fields: ${result.missing.join(", ")}`);
    }
  }

  const applicantName = [state.values.firstName, state.values.lastName].filter(Boolean).join(" ");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10">
      <div className="border-b border-border pb-10">
        <p className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-accent">
          <span className="live-dot" />
          {"// webmcp session active"}
        </p>
        <h1
          className="mt-4 text-6xl leading-[1.05] tracking-tight text-foreground sm:text-7xl"
          style={{ fontFamily: "var(--font-display-serif)" }}
        >
          Apply, <span className="italic">agent-assisted</span>.
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted">
          Every tool this app exposes to agents, runnable right here, next to a
          job-application form styled after a real ATS (Greenhouse, Workday, Lever)
          — so watching an agent fill it out looks like the real thing.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr] lg:items-start">
        <div className="flex flex-col gap-4 lg:sticky lg:top-6">
          <AgentChat />
        </div>

        <section className="hud-corners panel-depth overflow-hidden rounded-2xl border border-border bg-surface-raised">
          {/* Job posting header, styled like a real ATS listing */}
          <div className="border-b border-border bg-surface px-6 py-6">
            <div className="flex items-center gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border-hover bg-background font-mono text-sm font-bold">
                NC
              </span>
              <div className="min-w-0">
                <div className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-muted">
                  Nimbus Cloud Security
                </div>
                <h2
                  className="truncate text-2xl leading-tight tracking-tight"
                  style={{ fontFamily: "var(--font-display-serif)" }}
                >
                  Software Engineering Intern, <span className="italic">Platform Security</span>
                </h2>
                <div className="mt-0.5 text-xs text-muted">Buffalo, NY (Hybrid) · Internship</div>
              </div>
            </div>
          </div>

          <div className="px-6 py-6">
            {state.submitted ? (
              <div className="flex flex-col items-center gap-4 py-10 text-center">
                <CheckCircle2 size={40} className="text-accent" />
                <h3
                  className="text-3xl tracking-tight"
                  style={{ fontFamily: "var(--font-display-serif)" }}
                >
                  Application <span className="italic">submitted</span>.
                </h3>
                <p className="text-sm text-muted">
                  {applicantName || "The applicant"} applied to Nimbus Cloud Security —
                  this is a demo form, nothing left the browser.
                </p>
                <button
                  type="button"
                  onClick={() => resetApplyForm()}
                  className="mt-2 inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
                >
                  <RotateCcw size={14} />
                  Reset demo
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-8">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-6">
                  <p className="max-w-lg text-[13px] leading-relaxed text-foreground/80">
                    An agent can call{" "}
                    <code className="font-mono text-xs text-accent">fill_application_field</code>{" "}
                    to populate these fields and{" "}
                    <code className="font-mono text-xs text-accent">submit_application</code> to
                    send it — or fill it in yourself below.
                  </p>
                  <span className="whitespace-nowrap font-mono text-xs text-muted">
                    <span className="text-red-400">*</span> required
                  </span>
                </div>

                {error ? (
                  <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {error}
                  </div>
                ) : null}

                {/* What the agent has done so far — surfaces get_profile / list_documents / optimize_resume */}
                <div className="hud-corners flex flex-col gap-2 rounded-lg border border-border bg-surface px-4 py-3">
                  <h3 className="flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-widest text-muted">
                    <UserCheck size={13} />
                    Agent activity on this application
                  </h3>
                  <ul className="flex flex-col gap-1 font-mono text-xs text-muted">
                    <li>
                      {profileCheck ? (
                        <span className="text-accent">✓ Reviewed applicant profile (get_profile)</span>
                      ) : (
                        "· Profile not reviewed yet"
                      )}
                    </li>
                    <li>
                      {docsCheck ? (
                        <span className="text-accent">✓ Checked existing documents (list_documents)</span>
                      ) : (
                        "· Existing documents not checked yet"
                      )}
                    </li>
                    <li>
                      {resumeTailored ? (
                        <span className="text-accent">✓ Resume tailored to this role (optimize_resume)</span>
                      ) : (
                        "· Resume not tailored yet"
                      )}
                    </li>
                  </ul>
                </div>

                {/* Personal information */}
                <div className="flex flex-col gap-4">
                  <SectionLabel>Personal information</SectionLabel>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FieldInput field={NAME_FIELDS[0]} justFilled={justFilled} />
                    <FieldInput field={NAME_FIELDS[1]} justFilled={justFilled} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FieldInput field={CONTACT_FIELDS[0]} justFilled={justFilled} />
                    <FieldInput field={CONTACT_FIELDS[1]} justFilled={justFilled} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">
                        Country <span className="text-red-400">*</span>
                      </span>
                      <select value={country} onChange={(e) => setCountry(e.target.value)} className={SELECT_CLS}>
                        <option>United States</option>
                        <option>Canada</option>
                        <option>United Kingdom</option>
                        <option>India</option>
                        <option>Other</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">
                        Location (City) <span className="text-red-400">*</span>
                      </span>
                      <input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Buffalo, NY"
                        className={SELECT_CLS}
                      />
                    </label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">LinkedIn profile</span>
                      <input placeholder="linkedin.com/in/…" className={SELECT_CLS} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">Portfolio / website</span>
                      <input placeholder="github.com/…" className={SELECT_CLS} />
                    </label>
                  </div>
                </div>

                {/* Resume attachment */}
                <div className="flex flex-col gap-2">
                  <SectionLabel>
                    Resume/CV <span className="text-red-400">*</span>
                  </SectionLabel>
                  {resume ? (
                    <div className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent-light px-3 py-2.5 text-sm text-foreground">
                      <FileText size={16} className="shrink-0 text-accent" />
                      {resume.title}.pdf — attached via export_resume_pdf
                    </div>
                  ) : resumeTailored ? (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
                      Resume tailored but not exported yet — call{" "}
                      <code className="font-mono text-xs">export_resume_pdf</code> to attach the
                      file.
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted">
                      No resume attached yet — call{" "}
                      <code className="font-mono text-xs">export_resume_pdf</code> to attach one.
                    </div>
                  )}
                  <p className="text-xs text-muted">{ACCEPTED_FILE_TYPES}</p>
                </div>

                {/* Cover letter attachment */}
                <div className="flex flex-col gap-2">
                  <SectionLabel>Cover letter (optional)</SectionLabel>
                  {coverLetter ? (
                    <div className="flex items-start gap-2 rounded-lg border border-accent/40 bg-accent-light px-3 py-2.5 text-sm text-foreground">
                      <FileText size={16} className="mt-0.5 shrink-0 text-accent" />
                      <span>
                        Attached via optimize_cover_letter —{" "}
                        <span className="text-muted">{(coverLetter.output ?? "").slice(0, 140)}…</span>
                      </span>
                    </div>
                  ) : (
                    <div className="rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted">
                      No cover letter attached — call{" "}
                      <code className="font-mono text-xs">optimize_cover_letter</code> to write and
                      attach one.
                    </div>
                  )}
                  <p className="text-xs text-muted">{ACCEPTED_FILE_TYPES}</p>
                </div>

                {/* Application questions */}
                <div className="flex flex-col gap-4">
                  <SectionLabel>Application questions</SectionLabel>
                  {QUESTION_FIELDS.map((f) => (
                    <FieldInput key={f.key} field={f} justFilled={justFilled} multiline />
                  ))}
                </div>

                {/* Eligibility, standard on real ATS forms */}
                <div className="flex flex-col gap-4">
                  <SectionLabel>Eligibility</SectionLabel>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">
                        Are you legally authorized to work in the US?
                      </span>
                      <select value={workAuth} onChange={(e) => setWorkAuth(e.target.value)} className={SELECT_CLS}>
                        <option>Yes</option>
                        <option>No</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">
                        Will you now or in the future require visa sponsorship?
                      </span>
                      <select value={sponsorship} onChange={(e) => setSponsorship(e.target.value)} className={SELECT_CLS}>
                        <option>No</option>
                        <option>Yes</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">Willing to relocate?</span>
                      <select value={relocate} onChange={(e) => setRelocate(e.target.value)} className={SELECT_CLS}>
                        <option>Yes</option>
                        <option>No</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">
                        Bound by a non-compete or confidentiality agreement that would affect this
                        role?
                      </span>
                      <select value={nonCompete} onChange={(e) => setNonCompete(e.target.value)} className={SELECT_CLS}>
                        <option>No</option>
                        <option>Yes</option>
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium">How did you hear about us?</span>
                      <select value={heardAbout} onChange={(e) => setHeardAbout(e.target.value)} className={SELECT_CLS}>
                        <option value="">Select one</option>
                        <option>University career fair</option>
                        <option>LinkedIn</option>
                        <option>Referral</option>
                        <option>Company website</option>
                        <option>Other</option>
                      </select>
                    </label>
                    {heardAbout === "Other" ? (
                      <input
                        value={heardAboutOther}
                        onChange={(e) => setHeardAboutOther(e.target.value)}
                        placeholder="Please specify"
                        className={SELECT_CLS}
                      />
                    ) : null}
                  </div>
                </div>

                {/* EEO-style voluntary self-identification, standard on real ATS forms */}
                <details className="rounded-lg border border-border px-4 py-3">
                  <SectionLabel as="summary">
                    <span className="cursor-pointer">Voluntary self-identification (optional)</span>
                  </SectionLabel>
                  <p className="mt-2 text-xs text-muted">
                    Nimbus Cloud Security is an equal opportunity employer. Answering is voluntary
                    and has no effect on your application.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    {["Gender", "Race/Ethnicity", "Veteran status"].map((label) => (
                      <label key={label} className="flex flex-col gap-1">
                        <span className="text-xs font-medium">{label}</span>
                        <select
                          defaultValue="Decline to self-identify"
                          className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs outline-none focus:border-accent"
                        >
                          <option>Decline to self-identify</option>
                        </select>
                      </label>
                    ))}
                  </div>
                </details>

                {/* AI usage acknowledgment — relevant given this whole demo is agent-driven */}
                <label className="flex items-start gap-2.5 rounded-lg border border-border px-4 py-3 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={aiAcknowledged}
                    onChange={(e) => setAiAcknowledged(e.target.checked)}
                    className="mt-0.5 accent-accent"
                  />
                  <span>
                    <span className="font-medium text-foreground">
                      Acknowledgment of AI-assisted application <span className="text-red-400">*</span>
                    </span>
                    <br />
                    I understand this application may be prepared or submitted with help from an
                    AI agent using this site&apos;s WebMCP tools, and that Nimbus Cloud Security
                    may use AI-assisted tools to screen applications.
                  </span>
                </label>

                <button
                  type="button"
                  onClick={onSubmit}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-foreground py-3 font-mono text-xs font-semibold uppercase tracking-widest text-background transition-transform hover:scale-[1.01] active:scale-[0.99]"
                >
                  [ Submit application <Send size={13} /> ]
                </button>
                <p className="text-center text-xs text-muted">
                  Demo form for testing WebMCP tool-calling — no data leaves your browser, not
                  affiliated with Greenhouse, Workday, or any real employer.
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      <details className="group panel-depth overflow-hidden rounded-2xl border border-border bg-surface-raised">
        <summary className="flex cursor-pointer items-center gap-2 px-5 py-4 font-mono text-xs uppercase tracking-widest text-muted hover:text-foreground">
          <Terminal size={13} />
          <span className="text-foreground/35">{"//"}</span>
          Developer tools — inspect &amp; manually run any of the 8 WebMCP tools
          <ChevronRight size={13} className="ml-auto transition-transform group-open:rotate-90" />
        </summary>
        <div className="border-t border-border px-5 py-5">
          <ToolConsole />
        </div>
      </details>
    </div>
  );
}
