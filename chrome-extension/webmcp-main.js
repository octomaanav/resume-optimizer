/**
 * webmcp-main.js — WebMCP tool registration (Plane 3).
 *
 * MUST run in the MAIN world. Content scripts execute in an isolated world with
 * their own `navigator`, so tools registered from content.js are invisible to the
 * browser's agent — it fails silently, which is why this is a separate file
 * declared with "world": "MAIN" in the manifest.
 *
 * This file cannot use chrome.* APIs (MAIN world has none), so every handler
 * round-trips to content.js over window.postMessage.
 */

(() => {
  if (window.__roWebMcpRegistered) return;
  if (!navigator.modelContext) {
    console.log("[RO/WebMCP] navigator.modelContext unavailable — needs Chrome 146+ or Edge 147+.");
    return;
  }
  window.__roWebMcpRegistered = true;

  const PENDING = new Map();
  let seq = 0;

  /** Ask the isolated content script to do the actual DOM work. */
  function bridge(action, payload, timeoutMs = 120000) {
    return new Promise((resolve, reject) => {
      const id = `webmcp_${++seq}`;
      const timer = setTimeout(() => {
        PENDING.delete(id);
        reject(new Error(`${action} timed out`));
      }, timeoutMs);

      PENDING.set(id, { resolve, reject, timer });
      window.postMessage({ source: "ro-webmcp", direction: "request", id, action, payload }, "*");
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const d = event.data;
    if (!d || d.source !== "ro-webmcp" || d.direction !== "response") return;

    const entry = PENDING.get(d.id);
    if (!entry) return;
    clearTimeout(entry.timer);
    PENDING.delete(d.id);
    if (d.error) entry.reject(new Error(d.error));
    else entry.resolve(d.result);
  });

  const json = (value) => ({
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  });

  const TOOLS = [
    {
      name: "read_page_context",
      description:
        "Read this job posting in one call: the job description text, the ATS platform, and " +
        "every application form field with its selector and character limit.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      async execute() {
        return json(await bridge("READ_PAGE_CONTEXT", {}));
      },
    },
    {
      name: "scrape_job_description",
      description: "Extract just the job description text from this page.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      async execute() {
        const r = await bridge("READ_PAGE_CONTEXT", {});
        return json({ jd: r.jd, site: r.site, url: r.url });
      },
    },
    {
      name: "read_application_form",
      description:
        "List every fillable field in this application form, with a CSS selector, label, type " +
        "and character limit for each.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      async execute() {
        const r = await bridge("READ_PAGE_CONTEXT", {});
        return json({ fields: r.fields, resumeFileInputs: r.resumeFileInputs });
      },
    },
    {
      name: "detect_ats",
      description: "Identify which applicant tracking system this page belongs to.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      async execute() {
        const r = await bridge("READ_PAGE_CONTEXT", {});
        return json({ ats: r.site, url: r.url });
      },
    },
    {
      name: "fill_application_form",
      description:
        "Fill fields in this application form. The user is shown every field and must approve " +
        "before anything is typed. Never submits the form.",
      inputSchema: {
        type: "object",
        properties: {
          answers: {
            type: "array",
            description: "One entry per field.",
            items: {
              type: "object",
              properties: {
                selector: { type: "string", description: "CSS selector from read_application_form." },
                text: { type: "string" },
              },
              required: ["selector", "text"],
            },
          },
        },
        required: ["answers"],
      },
      async execute(input, client) {
        const answers = input?.answers ?? [];
        // requestUserInteraction is WebMCP's escape hatch for actions that need a
        // human. It focuses the tab and lets the page own the confirmation UI.
        const run = () => bridge("CONFIRM_AND_FILL", { answers }, 300000);
        const result = client?.requestUserInteraction
          ? await client.requestUserInteraction(run)
          : await run();
        return json(result);
      },
    },
    {
      name: "attach_resume",
      description:
        "Attach a resume PDF to this application's file upload field. The user must approve first.",
      inputSchema: {
        type: "object",
        properties: {
          base64Pdf: { type: "string" },
          filename: { type: "string" },
          selector: { type: "string", description: "Empty picks the first file input found." },
        },
        required: ["base64Pdf"],
      },
      async execute(input, client) {
        const run = () => bridge("CONFIRM_AND_ATTACH", input ?? {}, 300000);
        const result = client?.requestUserInteraction
          ? await client.requestUserInteraction(run)
          : await run();
        return json(result);
      },
    },
  ];

  function registerAll() {
    for (const tool of TOOLS) {
      try {
        navigator.modelContext.registerTool(tool);
      } catch (e) {
        // InvalidStateError means it is already registered — SPA re-navigation.
        if (e?.name !== "InvalidStateError") {
          console.warn("[RO/WebMCP] registerTool failed:", tool.name, e);
        }
      }
    }
    console.log(`[RO/WebMCP] registered ${TOOLS.length} tools on ${location.hostname}`);
  }

  registerAll();

  // ATS sites are heavy SPAs: a route change can tear down the tool set, so
  // re-register on history navigation. unregisterTool first to avoid duplicates.
  const reregister = () => {
    for (const t of TOOLS) {
      try {
        navigator.modelContext.unregisterTool?.(t.name);
      } catch {
        // Not registered; nothing to undo.
      }
    }
    registerAll();
  };

  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function (...args) {
      const out = original.apply(this, args);
      setTimeout(reregister, 300);
      return out;
    };
  }
  window.addEventListener("popstate", () => setTimeout(reregister, 300));
})();
