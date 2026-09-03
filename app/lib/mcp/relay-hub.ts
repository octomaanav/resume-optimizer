/**
 * relay-hub.ts — the bridge between the MCP server (Plane 1) and the browser
 * extension (Plane 2). See MCP_PLAN.md § Why the relay is mandatory.
 *
 * /api/mcp runs server-side; the ATS tab lives on the user's machine. The
 * extension opens a long-lived SSE stream to /api/mcp/relay and this hub pushes
 * tool invocations down it, matching responses back by request id.
 *
 * Module-level state, so it is per-process: fine for one dev server or one
 * container. A multi-instance deploy needs Redis pub/sub here instead.
 */

import {
  RELAY_DEFAULT_TIMEOUT_MS,
  type RelayRequest,
  type RelayResponse,
  type RelayedTool,
} from "./relay-contract";

type Session = {
  id: string;
  send: (req: RelayRequest) => void;
  connectedAt: number;
};

type Pending = {
  resolve: (r: RelayResponse) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Held on globalThis, not in module scope.
 *
 * Next's dev server hot-reloads route modules independently, which can hand
 * /api/mcp a different instance of this module than the one /api/mcp/relay
 * registered the live SSE stream on. The tools then report "no extension
 * connected" while the extension is plainly streaming. One global keeps both
 * planes looking at the same table.
 */
const globalState = globalThis as typeof globalThis & {
  __roRelaySessions?: Map<string, Session>;
  __roRelayPending?: Map<string, Pending>;
};

const sessions = (globalState.__roRelaySessions ??= new Map<string, Session>());
const pending = (globalState.__roRelayPending ??= new Map<string, Pending>());

export function registerSession(id: string, send: (req: RelayRequest) => void): () => void {
  sessions.set(id, { id, send, connectedAt: Date.now() });
  return () => {
    sessions.delete(id);
  };
}

/** Most recently connected extension wins when the caller doesn't name one. */
function pickSession(sessionId?: string): Session | null {
  if (sessionId) return sessions.get(sessionId) ?? null;
  let best: Session | null = null;
  for (const s of sessions.values()) {
    if (!best || s.connectedAt > best.connectedAt) best = s;
  }
  return best;
}

export function sessionCount(): number {
  return sessions.size;
}

export function listSessions(): Array<{ id: string; connectedAt: number }> {
  return [...sessions.values()].map((s) => ({ id: s.id, connectedAt: s.connectedAt }));
}

/** Called by POST /api/mcp/relay when the extension answers. */
export function resolveRelay(res: RelayResponse): boolean {
  const entry = pending.get(res.id);
  if (!entry) return false;
  clearTimeout(entry.timer);
  pending.delete(res.id);
  entry.resolve(res);
  return true;
}

export class NoExtensionError extends Error {
  constructor() {
    super("no extension connected");
    this.name = "NoExtensionError";
  }
}

/**
 * Invokes a tool inside the user's browser tab and waits for the result.
 * Never rejects on timeout — returns a RelayResponse with ok:false so the
 * calling tool can turn it into a readable message for the agent.
 */
export async function callRelay(
  tool: RelayedTool,
  input: unknown,
  timeoutMs: number = RELAY_DEFAULT_TIMEOUT_MS,
  sessionId?: string,
): Promise<RelayResponse> {
  const session = pickSession(sessionId);
  if (!session) throw new NoExtensionError();

  const id = crypto.randomUUID();
  const req: RelayRequest = { id, sessionId: session.id, tool, input, timeoutMs };

  return new Promise<RelayResponse>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({
        id,
        ok: false,
        error:
          `The browser did not respond within ${timeoutMs}ms. The tab may have navigated ` +
          `away, or the page has no such field.`,
      });
    }, timeoutMs);

    pending.set(id, { resolve, timer });

    try {
      session.send(req);
    } catch (e) {
      clearTimeout(timer);
      pending.delete(id);
      resolve({ id, ok: false, error: `Failed to reach the extension: ${String(e)}` });
    }
  });
}
