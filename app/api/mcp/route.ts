/**
 * /api/mcp — Streamable HTTP MCP endpoint (Plane 1).
 *
 * Hand-rolled JSON-RPC rather than the MCP SDK, deliberately:
 *   - no adapter friction between the SDK's Node req/res transport and the App Router
 *   - works on any host, not just Vercel
 *   - debuggable with a single curl, which matters at 2am during a hackathon
 *
 * Protocol versions: MCP 2026-07-28 dropped the initialize/initialized handshake in
 * favour of per-request `_meta` plus a `server/discover` RPC, but shipped clients are
 * still on 2025-06-18 / 2025-11-25. Both paths are handled below.
 * See MCP_PLAN.md § Registering with Claude and ChatGPT.
 */

import { z } from "zod";

import { PROMPTS, findPrompt } from "@/app/lib/mcp/prompts";
import { TOOLS, findTool, type ToolContext } from "@/app/lib/mcp/tools";

export const runtime = "nodejs";
export const maxDuration = 300;

const LATEST = "2026-07-28";
const SUPPORTED = ["2026-07-28", "2025-11-25", "2025-06-18", "2025-03-26"];

const SERVER_INFO = {
  name: "resume-optimizer",
  title: "Resume Optimizer",
  version: "0.1.0",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers":
    "content-type, authorization, mcp-protocol-version, mcp-method, mcp-name, mcp-session-id",
  "Access-Control-Expose-Headers": "mcp-protocol-version",
};

type JsonRpcId = string | number | null;

function result(id: JsonRpcId, value: unknown, version: string) {
  return Response.json(
    { jsonrpc: "2.0", id, result: value },
    { headers: { ...CORS, "MCP-Protocol-Version": version } },
  );
}

function error(id: JsonRpcId, code: number, message: string, status = 200) {
  return Response.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { status, headers: CORS },
  );
}

/**
 * Bearer auth. MCP_AUTH_TOKEN unset means open — acceptable for localhost dev,
 * never for a tunnelled or deployed instance, so that case is refused for
 * non-local hosts rather than silently running wide open.
 */
function checkAuth(req: Request): { ok: true } | { ok: false; reason: string } {
  const expected = process.env.MCP_AUTH_TOKEN?.trim();
  const host = new URL(req.url).hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";

  if (!expected) {
    if (isLocal) return { ok: true };
    return {
      ok: false,
      reason:
        "MCP_AUTH_TOKEN is not set. Refusing unauthenticated access from a non-local host. " +
        "Add MCP_AUTH_TOKEN=<random string> to .env.local and send it as a Bearer token.",
    };
  }

  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (token && token === expected) return { ok: true };
  return { ok: false, reason: "Invalid or missing Bearer token." };
}

function toolListPayload() {
  return {
    tools: TOOLS.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: z.toJSONSchema(t.schema, { io: "input" }),
      annotations: { readOnlyHint: t.readOnly, openWorldHint: true },
    })),
    // 2026-07-28 cacheable list results. Deliberately near-zero: this server is
    // under active development and a cached list leaves clients calling tools
    // that no longer match the server's schemas — or unable to see new ones.
    // Raise this once the tool surface stops changing.
    ttlMs: 1_000,
    cacheScope: "private" as const,
  };
}

function serverCapabilities() {
  return { tools: { listChanged: true }, prompts: { listChanged: true } };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

/** Some clients probe GET for a server→client SSE stream. Nothing to push. */
export async function GET() {
  return Response.json(
    { server: SERVER_INFO, protocolVersions: SUPPORTED, transport: "streamable-http" },
    { headers: CORS },
  );
}

export async function POST(req: Request) {
  const auth = checkAuth(req);
  if (!auth.ok) return error(null, -32001, auth.reason, 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return error(null, -32700, "Parse error: body is not valid JSON");
  }

  // Batches were removed in later revisions but older clients still send them.
  if (Array.isArray(body)) {
    const responses = await Promise.all(body.map((m) => handle(m, req)));
    const nonEmpty = responses.filter((r) => r !== null);
    if (nonEmpty.length === 0) return new Response(null, { status: 202, headers: CORS });
    return Response.json(nonEmpty, { headers: CORS });
  }

  const res = await handle(body, req);
  if (res === null) return new Response(null, { status: 202, headers: CORS });
  return res;
}

async function handle(message: unknown, req: Request): Promise<Response | null> {
  const msg = (message ?? {}) as {
    id?: JsonRpcId;
    method?: string;
    params?: Record<string, unknown>;
    _meta?: Record<string, unknown>;
  };
  const id = msg.id ?? null;
  const method = msg.method ?? "";
  const params = msg.params ?? {};

  // Version may arrive three ways depending on client vintage.
  const version =
    (params.protocolVersion as string) ||
    (msg._meta?.["io.modelcontextprotocol/protocolVersion"] as string) ||
    req.headers.get("mcp-protocol-version") ||
    LATEST;
  const negotiated = SUPPORTED.includes(version) ? version : LATEST;

  const ctx: ToolContext = { origin: new URL(req.url).origin };

  switch (method) {
    // Notifications: no id, no response body.
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;

    case "ping":
      return result(id, {}, negotiated);

    // 2025-x handshake.
    case "initialize":
      return result(
        id,
        {
          protocolVersion: negotiated,
          capabilities: serverCapabilities(),
          serverInfo: SERVER_INFO,
          instructions:
            "Resume Optimizer tailors resumes, cover letters and application answers to a job " +
            "description using the user's real profile. Start with the apply_to_job prompt. " +
            "Two steps require explicit user approval: review_resume_draft and " +
            "fill_application_form. Never invent experience, metrics or credentials.",
        },
        negotiated,
      );

    // 2026-07-28 replacement for initialize.
    case "server/discover":
      return result(
        id,
        {
          protocolVersions: SUPPORTED,
          capabilities: serverCapabilities(),
          serverInfo: SERVER_INFO,
        },
        negotiated,
      );

    case "tools/list":
      return result(id, toolListPayload(), negotiated);

    case "prompts/list":
      return result(
        id,
        {
          prompts: PROMPTS.map((p) => ({
            name: p.name,
            title: p.title,
            description: p.description,
            arguments: p.arguments,
          })),
          ttlMs: 1_000,
          cacheScope: "private",
        },
        negotiated,
      );

    case "prompts/get": {
      const prompt = findPrompt(String(params.name ?? ""));
      if (!prompt) return error(id, -32602, `Unknown prompt: ${params.name}`);
      const args = (params.arguments ?? {}) as Record<string, string>;
      return result(
        id,
        {
          description: prompt.description,
          messages: [
            { role: "user", content: { type: "text", text: prompt.build(args) } },
          ],
        },
        negotiated,
      );
    }

    case "tools/call": {
      const name = String(params.name ?? "");
      const tool = findTool(name);
      if (!tool) return error(id, -32602, `Unknown tool: ${name}`);

      const parsed = tool.schema.safeParse(params.arguments ?? {});
      if (!parsed.success) {
        return result(
          id,
          {
            content: [
              {
                type: "text",
                text: `Invalid arguments for ${name}: ${JSON.stringify(
                  z.treeifyError(parsed.error),
                )}`,
              },
            ],
            isError: true,
          },
          negotiated,
        );
      }

      try {
        const out = await tool.run(parsed.data as never, ctx);
        return result(id, out, negotiated);
      } catch (e) {
        const detail = e instanceof Error ? e.message : String(e);
        return result(
          id,
          { content: [{ type: "text", text: `${name} failed: ${detail}` }], isError: true },
          negotiated,
        );
      }
    }

    case "resources/list":
      return result(id, { resources: [] }, negotiated);

    default:
      return error(id, -32601, `Method not found: ${method}`);
  }
}
