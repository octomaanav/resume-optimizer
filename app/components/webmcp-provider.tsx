"use client";

import { useEffect, useRef } from "react";
import { logToolEnd, logToolStart } from "../lib/webmcp/activity-log-store";
import { setApplyFormField, submitApplyForm } from "../lib/webmcp/apply-form-store";
import "../lib/webmcp/global";
import { buildWebMcpTools } from "../lib/webmcp/tool-defs";
import { useWorkspace } from "../lib/workspace-context";

export const WEBMCP_PDF_EVENT = "webmcp:pdf-ready";

/**
 * Registers this app's actions as WebMCP tools once, on mount, so an agent
 * browsing the page (ChatGPT's in-app browser, WebMCP-enabled Chrome) can
 * call them directly instead of clicking through the UI. No-ops entirely
 * when the browser doesn't support `document.modelContext` yet.
 */
export function WebMcpProvider() {
  const { profile, workspace, patchWorkspace } = useWorkspace();

  // Tool `execute` callbacks are registered once but must always see the
  // latest data — keep a ref in sync every render instead of re-registering.
  const stateRef = useRef({ profile, workspace });
  useEffect(() => {
    stateRef.current = { profile, workspace };
  }, [profile, workspace]);

  useEffect(() => {
    if (typeof document === "undefined" || !document.modelContext?.registerTool) {
      return;
    }

    const controller = new AbortController();
    const tools = buildWebMcpTools();

    for (const tool of tools) {
      void document.modelContext.registerTool(
        {
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          annotations: tool.annotations,
          execute: async (input) => {
            const logId = logToolStart(tool.name, input ?? {});
            try {
              const result = await tool.execute(input ?? {}, {
                getProfile: () => stateRef.current.profile,
                getWorkspace: () => stateRef.current.workspace,
                patchWorkspace,
                announcePdf: (title, url) => {
                  window.dispatchEvent(
                    new CustomEvent(WEBMCP_PDF_EVENT, { detail: { title, url } }),
                  );
                },
                fillApplyField: setApplyFormField,
                submitApplyForm,
              });
              logToolEnd(logId, "done", result);
              return result;
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              logToolEnd(logId, "error", msg);
              throw e;
            }
          },
        },
        { signal: controller.signal },
      );
    }

    return () => controller.abort();
  }, [patchWorkspace]);

  return null;
}
