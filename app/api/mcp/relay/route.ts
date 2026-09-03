/**
 * /api/mcp/relay — the wire between the MCP server and the browser extension.
 *
 *   GET  ?sessionId=<id>   extension opens a long-lived SSE stream; the server
 *                          pushes RelayRequest frames down it
 *   POST                   extension posts a RelayResponse back
 *   HEAD                   cheap liveness probe used by the extension UI
 *
 * Deliberately not authenticated with MCP_AUTH_TOKEN: the extension runs on the
 * same machine as the dev server and has no place to hold a secret safely. If
 * this is ever exposed beyond localhost, gate it on a per-session pairing code.
 */

import { NextResponse } from "next/server";

import {
  listSessions,
  registerSession,
  resolveRelay,
  sessionCount,
} from "@/app/lib/mcp/relay-hub";
import type { RelayRequest, RelayResponse } from "@/app/lib/mcp/relay-contract";

export const runtime = "nodejs";
export const maxDuration = 3600;
/** SSE must stream, never be collected into a cached response. */
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: { ...CORS, "X-Relay-Sessions": String(sessionCount()) },
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId") ?? crypto.randomUUID();

  // No sessionId means a human hit this in a browser; show status instead of
  // hanging on an SSE stream they cannot read.
  if (!url.searchParams.has("sessionId") && !url.searchParams.has("stream")) {
    return NextResponse.json(
      { sessions: listSessions(), count: sessionCount() },
      { headers: CORS },
    );
  }

  const encoder = new TextEncoder();
  let unregister = () => {};
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      const write = (event: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Stream already closed by the client; the abort handler cleans up.
        }
      };

      write("ready", { sessionId });

      unregister = registerSession(sessionId, (r: RelayRequest) => write("invoke", r));

      // Proxies and the browser both drop idle event streams; 20s keeps it warm.
      heartbeat = setInterval(() => write("ping", { t: Date.now() }), 20_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        unregister();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel() {
      clearInterval(heartbeat);
      unregister();
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS });
  }

  const res = body as Partial<RelayResponse>;
  if (!res || typeof res.id !== "string") {
    return NextResponse.json(
      { error: "Missing response id" },
      { status: 400, headers: CORS },
    );
  }

  const matched = resolveRelay({
    id: res.id,
    ok: Boolean(res.ok),
    result: res.result,
    error: res.error,
  });

  // Unmatched means the tool call already timed out — worth surfacing, not fatal.
  return NextResponse.json({ ok: true, matched }, { headers: CORS });
}
