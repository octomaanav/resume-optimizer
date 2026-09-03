export type ActivityLogEntry = {
  id: string;
  tool: string;
  input: unknown;
  output: string | null;
  status: "running" | "done" | "error";
  startedAt: number;
  durationMs: number | null;
};

export const ACTIVITY_LOG_EVENT = "webmcp:activity-changed";

const MAX_ENTRIES = 50;
let entries: ActivityLogEntry[] = [];

function notify() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACTIVITY_LOG_EVENT, { detail: entries }));
}

export function getActivityLog(): ActivityLogEntry[] {
  return entries;
}

export function logToolStart(tool: string, input: unknown): string {
  const id = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const entry: ActivityLogEntry = {
    id,
    tool,
    input,
    output: null,
    status: "running",
    startedAt: Date.now(),
    durationMs: null,
  };
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  notify();
  return id;
}

export function logToolEnd(id: string, status: "done" | "error", output: string) {
  entries = entries.map((e) =>
    e.id === id ? { ...e, status, output, durationMs: Date.now() - e.startedAt } : e,
  );
  notify();
}
