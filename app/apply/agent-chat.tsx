"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send } from "lucide-react";
import { getActivityLog } from "../lib/webmcp/activity-log-store";
import { getApplyFormState } from "../lib/webmcp/apply-form-store";
import { buildWebMcpTools } from "../lib/webmcp/tool-defs";
import "../lib/webmcp/global";

type GroqToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: GroqToolCall[];
  tool_call_id?: string;
  name?: string;
};

const SYSTEM_PROMPT = `You are an assistant helping a candidate apply to the job posted on this page: "Software Engineering Intern, Platform Security" at Nimbus Cloud Security. You have tools to read the candidate's profile and existing documents, tailor a resume and cover letter to a job description, answer application questions, fill out the application form on this page, export a PDF resume, and submit the application.

When asked to apply for the job, complete every one of these steps, in order, before calling submit_application — do not skip any of them just because the form would technically accept less:
1. get_profile — get the candidate's real name, email, and phone. Use exactly what it returns for the form fields; never invent contact details.
2. optimize_resume — tailor the resume to the job description given to you.
3. export_resume_pdf — attach the tailored resume as a PDF.
4. optimize_cover_letter — write and attach a tailored cover letter. Do this even though the form marks it optional — a complete application includes one.
5. answer_application_question — once for "Why are you interested in this role?" AND once for "Tell us about a project you're proud of". Both questions, not just one.
6. fill_application_field — for firstName, lastName, email, phone, whyThisRole, AND relevantProject. All six, not just the four required ones.
7. Only after all of the above are done, call submit_application.

Whenever you have multiple independent actions ready at once — e.g. filling several fields once you have their values — call those tools together in the same turn instead of one at a time across separate turns. Only split into separate turns when a later call genuinely needs an earlier result. Keep replies brief — a sentence or two between tool calls, not a long narration.`;

function toolSchemas() {
  return buildWebMcpTools().map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

/**
 * Groq's free tier caps total tokens/minute, and every turn resends the
 * whole conversation — so older tool results (already acted on) get
 * shortened before sending. The full text still lives in the actual app
 * state (workspace, activity log); the model only needs a marker that the
 * step happened, not to re-read it in full on every subsequent turn.
 */
function compactForSending(messages: ChatMessage[]): ChatMessage[] {
  const toolIndices = messages
    .map((m, i) => (m.role === "tool" ? i : -1))
    .filter((i) => i !== -1);
  const keepFull = new Set(toolIndices.slice(-3));
  return messages.map((m, i) => {
    if (m.role !== "tool" || keepFull.has(i) || !m.content || m.content.length <= 150) {
      return m;
    }
    return { ...m, content: `${m.content.slice(0, 150)}… [truncated — already applied]` };
  });
}

type Provider = "auto" | "gemini" | "groq" | "local";

async function callAgent(messages: ChatMessage[], provider: Provider): Promise<ChatMessage> {
  const res = await fetch("/api/agent/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-ai-provider": provider },
    body: JSON.stringify({ messages: compactForSending(messages), tools: toolSchemas() }),
  });
  if (!res.ok) {
    const text = await res.text();
    let message = text || `Agent request failed (${res.status})`;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      if (parsed.error) message = parsed.error.split("\n")[0];
    } catch {
      // not JSON, use raw text
    }
    throw new Error(message);
  }
  const data = (await res.json()) as { message: ChatMessage };
  return data.message;
}

async function executeToolCall(call: GroqToolCall): Promise<string> {
  if (!document.modelContext?.executeTool || !document.modelContext.getTools) {
    return "WebMCP is not available in this browser.";
  }
  const allTools = await document.modelContext.getTools();
  const handle = allTools.find((t) => t.name === call.function.name);
  if (!handle) return `Unknown tool: ${call.function.name}`;
  try {
    return await document.modelContext.executeTool(handle, call.function.arguments || "{}");
  } catch (e) {
    return `Error: ${e instanceof Error ? e.message : String(e)}`;
  }
}

type PendingSubmit = { call: GroqToolCall; historyAtPause: ChatMessage[] };

function whatsStillEmpty(): string[] {
  const form = getApplyFormState().values;
  const log = getActivityLog();
  const gaps: string[] = [];
  if (!form.relevantProject.trim()) gaps.push('"project you\'re proud of" answer');
  if (!log.some((e) => e.tool === "optimize_cover_letter" && e.status === "done")) {
    gaps.push("cover letter");
  }
  return gaps;
}

export function AgentChat() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: "system", content: SYSTEM_PROMPT },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingSubmit, setPendingSubmit] = useState<PendingSubmit | null>(null);
  const [provider, setProvider] = useState<Provider>("auto");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSupported(typeof document !== "undefined" && !!document.modelContext?.executeTool);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingSubmit]);

  const MAX_TURNS = 18;

  async function runTurn(history: ChatMessage[]) {
    let current = history;
    for (let i = 0; i < MAX_TURNS; i++) {
      const assistantMsg = await callAgent(current, provider);
      current = [...current, assistantMsg];
      setMessages(current);

      const calls = assistantMsg.tool_calls ?? [];
      if (calls.length === 0) return;

      const submitCall = calls.find((c) => c.function.name === "submit_application");
      const otherCalls = calls.filter((c) => c.function.name !== "submit_application");

      for (const call of otherCalls) {
        const result = await executeToolCall(call);
        current = [
          ...current,
          { role: "tool", tool_call_id: call.id, name: call.function.name, content: result },
        ];
      }
      setMessages(current);

      if (submitCall) {
        setPendingSubmit({ call: submitCall, historyAtPause: current });
        return;
      }
    }
    setError(
      `Stopped after ${MAX_TURNS} steps without finishing — send another message ("continue") to keep going.`,
    );
  }

  async function onSend() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    setBusy(true);
    try {
      const next: ChatMessage[] = [...messages, { role: "user", content: text }];
      setMessages(next);
      await runTurn(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmSubmit() {
    if (!pendingSubmit) return;
    setBusy(true);
    try {
      const result = await executeToolCall(pendingSubmit.call);
      const updated: ChatMessage[] = [
        ...pendingSubmit.historyAtPause,
        {
          role: "tool",
          tool_call_id: pendingSubmit.call.id,
          name: "submit_application",
          content: result,
        },
      ];
      setMessages(updated);
      setPendingSubmit(null);
    } finally {
      setBusy(false);
    }
  }

  function onCancelSubmit() {
    if (!pendingSubmit) return;
    const updated: ChatMessage[] = [
      ...pendingSubmit.historyAtPause,
      {
        role: "tool",
        tool_call_id: pendingSubmit.call.id,
        name: "submit_application",
        content: "The user declined to submit yet. Do not call submit_application again unless asked.",
      },
    ];
    setMessages(updated);
    setPendingSubmit(null);
  }

  const visible = messages.filter((m) => m.role === "user" || m.role === "assistant");

  return (
    <section className="hud-corners panel-depth rounded-2xl border border-border bg-surface-raised p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-widest text-foreground">
            <Bot size={14} className={supported ? "text-accent" : "text-muted"} />
            Apply for me
            {supported ? <span className="live-dot ml-1 text-accent" /> : null}
          </h2>
          <p className="mt-1 text-xs text-muted">
            Tell it to apply, paste the job description, and it calls the tools
            below on its own — pausing for your OK right before it submits.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 rounded-lg border border-border p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setProvider("auto")}
            disabled={busy}
            className={`rounded-md px-2 py-1 font-medium ${
              provider === "auto" ? "bg-accent text-background" : "text-muted"
            }`}
          >
            Auto
          </button>
          <button
            type="button"
            onClick={() => setProvider("gemini")}
            disabled={busy}
            className={`rounded-md px-2 py-1 font-medium ${
              provider === "gemini" ? "bg-accent text-background" : "text-muted"
            }`}
          >
            Gemini
          </button>
          <button
            type="button"
            onClick={() => setProvider("groq")}
            disabled={busy}
            className={`rounded-md px-2 py-1 font-medium ${
              provider === "groq" ? "bg-accent text-background" : "text-muted"
            }`}
          >
            Groq
          </button>
          <button
            type="button"
            onClick={() => setProvider("local")}
            disabled={busy}
            className={`rounded-md px-2 py-1 font-medium ${
              provider === "local" ? "bg-accent text-background" : "text-muted"
            }`}
          >
            Local
          </button>
        </div>
      </div>
      {provider === "auto" ? (
        <p className="mt-2 text-xs text-muted">
          Tries Gemini, then Groq, then your local model — automatically moves
          on if one is rate-limited or down.
        </p>
      ) : provider === "local" ? (
        <p className="mt-2 text-xs text-muted">
          Using your local model — no rate limit, but only works while it&apos;s
          running on this machine.
        </p>
      ) : null}

      {supported === false ? (
        <p className="mt-3 text-xs text-muted">
          Enable <code className="font-mono">chrome://flags/#enable-webmcp-testing</code>{" "}
          to use this here.
        </p>
      ) : (
        <>
          <div className="mt-4 flex max-h-80 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-surface p-3">
            {visible.length === 0 ? (
              <p className="text-sm text-muted">
                Try: &ldquo;Apply to this job for me — here&apos;s the JD: [paste it]&rdquo;
              </p>
            ) : (
              visible.map((m, i) => (
                <div
                  key={i}
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "self-end bg-accent text-background"
                      : "self-start bg-surface-raised text-foreground"
                  }`}
                >
                  {m.content || (
                    <span className="term-cursor font-mono italic text-muted">working</span>
                  )}
                </div>
              ))
            )}
            {busy ? (
              <div className="self-start rounded-xl border border-border-hover bg-surface-raised px-3 py-2 text-sm text-muted">
                <span className="term-cursor font-mono">Calling tools</span>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>

          {pendingSubmit ? (
            <div className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="text-amber-900">
                The agent wants to submit this application. Check the form below,
                then confirm.
              </p>
              {whatsStillEmpty().length > 0 ? (
                <p className="text-amber-800/90">
                  Still empty: {whatsStillEmpty().join(", ")}. Confirm anyway, or
                  click &ldquo;Not yet&rdquo; and ask it to finish those first.
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void onConfirmSubmit()}
                  disabled={busy}
                  className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-background disabled:opacity-50"
                >
                  Confirm submit
                </button>
                <button
                  type="button"
                  onClick={onCancelSubmit}
                  disabled={busy}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-50"
                >
                  Not yet
                </button>
              </div>
            </div>
          ) : null}

          {error ? <p className="mt-3 text-xs text-red-700">{error}</p> : null}

          <div className="mt-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void onSend();
                }
              }}
              placeholder="Apply to this job for me…"
              disabled={busy || !!pendingSubmit}
              className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => void onSend()}
              disabled={busy || !input.trim() || !!pendingSubmit}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              <Send size={14} />
              Send
            </button>
          </div>
        </>
      )}
    </section>
  );
}
