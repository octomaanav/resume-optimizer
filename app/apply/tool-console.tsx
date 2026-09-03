"use client";

import { useEffect, useMemo, useState } from "react";
import { Play, Radio } from "lucide-react";
import {
  ACTIVITY_LOG_EVENT,
  getActivityLog,
  type ActivityLogEntry,
} from "../lib/webmcp/activity-log-store";
import "../lib/webmcp/global";
import { buildWebMcpTools } from "../lib/webmcp/tool-defs";

type SchemaProperty = { type?: string; description?: string; enum?: string[] };

function schemaProps(inputSchema: Record<string, unknown>): Record<string, SchemaProperty> {
  const props = inputSchema.properties;
  if (props && typeof props === "object") return props as Record<string, SchemaProperty>;
  return {};
}

function schemaRequired(inputSchema: Record<string, unknown>): string[] {
  const req = inputSchema.required;
  return Array.isArray(req) ? (req as string[]) : [];
}

function relativeTime(ts: number): string {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.round(s / 60)}m ago`;
}

function statusColor(status: ActivityLogEntry["status"]) {
  if (status === "running") return "bg-amber-50 text-amber-800";
  if (status === "error") return "bg-red-50 text-red-700";
  return "bg-accent-light text-accent";
}

/** Plain-English summary for the default view — the raw JSON is still available behind "raw". */
function describeCall(entry: ActivityLogEntry): string {
  const input = (entry.input ?? {}) as Record<string, unknown>;
  switch (entry.tool) {
    case "get_profile":
      return "Checked the candidate's profile";
    case "list_documents":
      return "Checked existing saved documents";
    case "optimize_resume":
      return "Tailored the resume to the job description";
    case "export_resume_pdf":
      return "Exported the resume as a PDF";
    case "optimize_cover_letter":
      return "Wrote a tailored cover letter";
    case "answer_application_question": {
      const q = typeof input.question === "string" ? input.question : "a question";
      return `Answered: "${q}"`;
    }
    case "fill_application_field": {
      const f = typeof input.field === "string" ? input.field : "a field";
      return `Filled the "${f}" field`;
    }
    case "submit_application":
      return "Submitted the application";
    default:
      return entry.tool;
  }
}

export function ToolConsole() {
  const tools = useMemo(() => buildWebMcpTools(), []);
  const [selected, setSelected] = useState(tools[0]?.name ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState<boolean | null>(null);
  const [log, setLog] = useState<ActivityLogEntry[]>(() => getActivityLog());

  useEffect(() => {
    setSupported(typeof document !== "undefined" && !!document.modelContext?.executeTool);
  }, []);

  useEffect(() => {
    function onChange(e: Event) {
      setLog((e as CustomEvent<ActivityLogEntry[]>).detail);
    }
    window.addEventListener(ACTIVITY_LOG_EVENT, onChange as EventListener);
    return () => window.removeEventListener(ACTIVITY_LOG_EVENT, onChange as EventListener);
  }, []);

  const activeTool = tools.find((t) => t.name === selected) ?? tools[0];
  const props = activeTool ? schemaProps(activeTool.inputSchema) : {};
  const required = activeTool ? schemaRequired(activeTool.inputSchema) : [];

  async function onRun() {
    if (!activeTool || !document.modelContext?.executeTool) return;
    setBusy(true);
    try {
      const allTools = await document.modelContext.getTools();
      const toolHandle = allTools.find((t) => t.name === activeTool.name);
      if (!toolHandle) return;
      const input: Record<string, unknown> = {};
      for (const key of Object.keys(props)) {
        const raw = values[key];
        if (raw === undefined || raw === "") continue;
        input[key] = props[key].type === "number" ? Number(raw) : raw;
      }
      await document.modelContext.executeTool(toolHandle, JSON.stringify(input));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-2xl border border-border bg-surface-raised p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-muted">
            <Radio size={14} className={supported ? "text-accent" : "text-muted"} />
            WebMCP tools ({tools.length})
          </h2>
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-xs font-medium ${
              supported ? "bg-accent-light text-accent" : "bg-surface text-muted"
            }`}
          >
            {supported ? <span className="live-dot" /> : null}
            {supported === null ? "Checking…" : supported ? "Agent-callable in this browser" : "WebMCP not enabled here"}
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Tool</span>
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setValues({});
              }}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            >
              {tools.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
            {activeTool ? (
              <span className="text-xs text-muted">{activeTool.description}</span>
            ) : null}
          </label>

          {Object.keys(props).length === 0 ? (
            <p className="text-xs text-muted">No input needed for this tool.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {Object.entries(props).map(([key, prop]) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="text-xs font-medium">
                    {key}
                    {required.includes(key) ? <span className="text-red-500"> *</span> : null}
                  </span>
                  {prop.enum ? (
                    <select
                      value={values[key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                      className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
                    >
                      <option value="">—</option>
                      {prop.enum.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <textarea
                      value={values[key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
                      placeholder={prop.description}
                      rows={key.toLowerCase().includes("description") || key === "question" ? 3 : 1}
                      className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent"
                    />
                  )}
                </label>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => void onRun()}
            disabled={busy || !supported}
            className="inline-flex items-center justify-center gap-2 self-start rounded-xl bg-accent px-4 py-2 text-sm font-medium text-background shadow-sm disabled:opacity-50 hover:bg-accent-dark"
          >
            <Play size={14} />
            {busy ? "Running…" : "Run tool"}
          </button>
          {!supported ? (
            <p className="text-xs text-muted">
              Enable{" "}
              <code className="font-mono">chrome://flags/#enable-webmcp-testing</code>{" "}
              (or open this page in ChatGPT&apos;s in-app browser) to call tools directly
              from here.
            </p>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface-raised p-5">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-muted">
          Live activity
        </h2>
        <p className="mt-1 text-xs text-muted">
          Every tool call shows up here in real time — from this console, or from an
          agent calling the same tools elsewhere.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {log.length === 0 ? (
            <p className="text-sm text-muted">No tool calls yet.</p>
          ) : (
            log.map((entry) => (
              <div
                key={entry.id}
                className="rounded-xl border border-border bg-surface p-3 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-foreground">{describeCall(entry)}</span>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-medium ${statusColor(entry.status)}`}>
                      {entry.status}
                      {entry.durationMs ? ` · ${entry.durationMs}ms` : ""}
                    </span>
                    <span className="font-mono text-xs text-muted">{relativeTime(entry.startedAt)}</span>
                  </div>
                </div>
                {entry.output ? (
                  <p className="mt-2 whitespace-pre-wrap text-xs text-muted">{entry.output}</p>
                ) : null}
                <details className="mt-2">
                  <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wide text-muted hover:text-accent">
                    raw · {entry.tool}
                  </summary>
                  <pre className="mt-1 overflow-x-auto rounded-lg bg-background p-2 text-[11px] text-muted">
                    {JSON.stringify(entry.input)}
                  </pre>
                </details>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
