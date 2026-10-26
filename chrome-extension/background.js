/**
 * background.js — MV3 Service Worker
 *
 * Responsibilities:
 *  1. On extension icon click: inject content.js into the active tab, then
 *     send TOGGLE_OVERLAY so a floating panel appears/disappears in the page.
 *  2. Relay messages from the sidebar iframe to the page's content script.
 *  3. Make all AI + profile API calls (CORS bypassed by host_permissions).
 */

// ─── Icon click → toggle overlay ─────────────────────────────────────────────

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  // Programmatically inject content script so the overlay works even on tabs
  // that were open before the extension was installed / reloaded.
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
  } catch {
    // Already injected, or restricted page (chrome://, etc.) — continue.
  }

  chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_OVERLAY" }).catch(() => {});
});

// ─── Message router ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case "PING":
      sendResponse({ ok: true });
      break;

    case "RELAY_TO_CONTENT":
      relayToOriginTab(message.payload, _sender.tab?.id).then(sendResponse).catch((e) =>
        sendResponse({ error: e.message })
      );
      return true;

    case "CLOSE_OVERLAY":
      relayToOriginTab({ type: "HIDE_OVERLAY" }, _sender.tab?.id).catch(() => {});
      sendResponse({ ok: true });
      break;

    case "SYNC_PROFILE":
      if (!_sender.url?.startsWith(chrome.runtime.getURL("sidebar/"))) { sendResponse({ error: "Connect from the extension sidebar." }); return; }
      syncProfileFromApp(message.appUrl)
        .then(sendResponse)
        .catch((e) => sendResponse({ error: e.message }));
      return true;

    case "OPTIMIZE":
      handleOptimize(message.payload)
        .then(sendResponse)
        .catch((e) => sendResponse({ error: e.message }));
      return true;

    case "OPTIMIZE_RESUME":
      handleOptimizeResume(message.payload)
        .then(sendResponse)
        .catch((e) => sendResponse({ error: e.message }));
      return true;

    case "GENERATE_ANSWERS":
      handleGenerateAnswers(message.payload)
        .then(sendResponse)
        .catch((e) => sendResponse({ error: e.message }));
      return true;

    case "SAVE_QA_TEMPLATES":
      saveQaTemplates(message.payload)
        .then(sendResponse)
        .catch((e) => sendResponse({ error: e.message }));
      return true;

    case "GENERATE_FIELD_ANSWER":
      handleGenerateFieldAnswer(message.payload)
        .then(sendResponse)
        .catch((e) => sendResponse({ error: e.message }));
      return true;

    case "EXTRACT_JD_KEYWORDS_DETERMINISTIC":
      handleExtractJdKeywordsDeterministic(message.payload)
        .then(sendResponse)
        .catch((e) => sendResponse({ error: e.message }));
      return true;

    case "AUTO_DETECTED":
      // Fire-and-forget broadcast from content scripts. The sidebar listens
      // directly; background just acks so the sender's promise resolves.
      sendResponse({ ok: true });
      break;

    case "AUTO_SYNC_LOCAL_WORKSPACE":
      // Database-backed sync only. Web pages must never supply an identity or
      // overwrite trusted extension storage via their own localStorage.
      sendResponse({ error: "Legacy page storage sync is disabled. Connect to the signed-in app." });
      break;

    default:
      sendResponse({ error: `Unknown message type: ${message.type}` });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function relayToOriginTab(payload, originTabId) {
  if (!Number.isInteger(originTabId)) throw new Error("Cannot identify the originating application tab. Reopen the sidebar on that tab.");
  const tab = { id: originTabId };

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
  } catch {
    // Already injected or restricted page.
  }

  return chrome.tabs.sendMessage(tab.id, payload);
}

/** Only an explicitly configured app tab may expose its origin-scoped IndexedDB. */
async function deviceWorkspaceFromApp(appUrl, applicationAnswerDocs) {
  const url = new URL(appUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Use the app's HTTPS address or localhost.");
  const tabs = await chrome.tabs.query({ url: `${url.origin}/*` });
  if (!tabs.length) return null;
  const stored = await chrome.storage.local.get(["workspaceOwner"]);
  const [result] = await chrome.scripting.executeScript({
    target: { tabId: tabs[0].id },
    args: [applicationAnswerDocs ?? null, stored.workspaceOwner ?? null],
    func: async (answers, expectedOwner) => {
      const session = await (await fetch("/api/auth/session", { credentials: "include", cache: "no-store" })).json();
      const owner = session.user?.id;
      if (!owner) return { error: "Sign in to the app before connecting the extension." };
      if (answers && expectedOwner !== owner) return { error: "The app account changed. Connect & Sync again before saving answers." };
      const mode = localStorage.getItem(`resume-storage-mode:${owner}`);
      if (answers && mode === "cloud") return { error: "Switch to the synced device workspace before saving answers." };
      const request = indexedDB.open("resume-optimizer-private", 1);
      const db = await new Promise((resolve, reject) => {
        request.onupgradeneeded = () => request.result.createObjectStore("workspaces");
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(new Error("Could not read device workspace."));
      });
      try {
        const tx = db.transaction("workspaces", answers ? "readwrite" : "readonly");
        const store = tx.objectStore("workspaces");
        let snapshot;
        await new Promise((resolve, reject) => {
          const read = store.get(owner);
          read.onsuccess = () => {
            snapshot = read.result;
            if (answers && snapshot) { snapshot.workspace.applicationAnswerDocs = answers; store.put(snapshot, owner); }
          };
          tx.oncomplete = resolve; tx.onerror = tx.onabort = () => reject(new Error("Device save failed."));
        });
        return { snapshot, mode, owner };
      } finally { db.close(); }
    },
  });
  if (result?.result?.error) throw new Error(result.result.error);
  return result?.result ?? null;
}

async function syncProfileFromApp(appUrl) {
  const base = (appUrl || "http://localhost:3000").replace(/\/$/, "");

  const device = await deviceWorkspaceFromApp(base);
  if (device?.snapshot && device.mode !== "cloud") {
    await chrome.storage.local.set({ workspaceStorageMode: "local", workspaceOwner: device.owner });
    return { profile: device.snapshot.profile, settings: device.snapshot.workspace.settings, applicationAnswerDocs: device.snapshot.workspace.applicationAnswerDocs };
  }
  const [profileRes, workspaceRes] = await Promise.all([
    fetch(`${base}/api/database/profiles/me`, { credentials: "include" }),
    fetch(`${base}/api/database/workspace/me`, { credentials: "include" }),
  ]);

  if (!profileRes.ok) {
    const text = await profileRes.text();
    throw new Error(
      profileRes.status === 403
        ? "Open the app in a tab, sign in, save your device profile, then Connect & Sync again. Cloud storage is disabled."
        : profileRes.status === 401
        ? "Not logged in. Open the app, sign in, then try again."
        : `Profile fetch failed (${profileRes.status}): ${text.slice(0, 200)}`
    );
  }

  const { profile } = await profileRes.json();

  let settings = null;
  let applicationAnswerDocs = [];
  if (workspaceRes.ok) {
    const { workspace } = await workspaceRes.json();
    settings = workspace?.settings ?? null;
    applicationAnswerDocs = workspace?.applicationAnswerDocs ?? [];
  }

  if (device?.snapshot) settings = { ...settings, geminiApiKey: device.snapshot.workspace.settings.geminiApiKey, groqApiKey: device.snapshot.workspace.settings.groqApiKey };
  await chrome.storage.local.set({ workspaceStorageMode: "cloud", workspaceOwner: device?.owner ?? null });
  return { profile, settings, applicationAnswerDocs };
}

/** Use the provider selected in the synced app settings. */
function buildAiHeaders(settings) {
  const provider = settings?.aiProvider || "ollama";
  if (provider === "groq") return { "Content-Type": "application/json", "x-ai-provider": "groq",
    ...(settings?.groqApiKey ? { "x-groq-api-key": settings.groqApiKey.trim() } : {}),
    "x-groq-model": settings?.groqModel || "openai/gpt-oss-120b" };
  if (provider === "gemini") return { "Content-Type": "application/json", "x-ai-provider": "gemini",
    ...(settings?.geminiApiKey ? { "x-gemini-api-key": settings.geminiApiKey.trim() } : {}) };

  let baseUrl = (settings?.ollamaBaseUrl || "http://127.0.0.1:11434").trim();
  baseUrl = baseUrl.replace(/\/$/, "");
  baseUrl = baseUrl.replace(/^http:\/\/localhost/i, "http://127.0.0.1");
  return {
    "Content-Type": "application/json",
    "x-ai-provider": "ollama",
    "x-ollama-base-url": baseUrl,
    "x-ollama-model": (settings?.ollamaModel || "llama3.2").trim(),
  };
}

async function assertOllamaReachable(appUrl, settings) {
  if (settings?.aiProvider && settings.aiProvider !== "ollama") return;
  const base = (appUrl || "http://localhost:3000").replace(/\/$/, "");
  const headers = buildAiHeaders(settings);
  let res;
  try {
    res = await fetch(`${base}/api/ai/ollama-health`, { headers, credentials: "include" });
  } catch (e) {
    throw new Error(
      `Cannot reach the web app at ${base}. Is "npm run dev" running? (${e instanceof Error ? e.message : e})`,
    );
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(
      data.error ||
        "Ollama is not running. In a terminal run: ollama serve",
    );
  }
  if (data.modelInstalled === false && data.hint) {
    throw new Error(data.hint);
  }
}

async function handleOptimize({ jd, questions, profile, settings }) {
  const appUrl = (settings.appUrl || "http://localhost:3000").replace(/\/$/, "");
  const skillsMd = settings.skillsMd || "";

  await assertOllamaReachable(appUrl, settings);
  const headers = buildAiHeaders(settings);

  const endpoint = `${appUrl}/api/ai/generate`;
  const allExperienceIds = (profile.experience ?? []).map((e) => e.id);
  const allProjectIds = (profile.projects ?? []).map((p) => p.id);

  const resumePromise = callGenerate(endpoint, headers, {
    kind: "resume",
    mode: "bullets",
    jd,
    profile,
    skillsMd,
    selectedExperienceIds: allExperienceIds,
    selectedProjectIds: allProjectIds,
  });

  const coverLetterPromise = callGenerate(endpoint, headers, {
    kind: "coverLetter",
    jd,
    profile,
    skillsMd,
  });

  const answerPromises = questions.map((q) =>
    callGenerate(endpoint, headers, {
      kind: "applicationAnswer",
      jd,
      profile,
      skillsMd,
      applicationQuestion: q.label,
      draftAnswer: q.templateAnswer || "",
    }).then((result) => ({ ...result, selector: q.selector, label: q.label }))
  );

  const [resume, coverLetter, ...answers] = await Promise.all([
    resumePromise,
    coverLetterPromise,
    ...answerPromises,
  ]);

  return { resume, coverLetter, answers };
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * JD-tailored resume for the extension:
 *  1. Select the best 4 experiences + 2 projects for the JD.
 *  2. Rewrite bullets for those selected items only.
 *  3. Compile PDF with only the selected items.
 */
async function handleOptimizeResume({ jd, profile, settings }) {
  const appUrl = (settings.appUrl || "http://localhost:3000").replace(/\/$/, "");
  const skillsMd = settings.skillsMd || "";

  await assertOllamaReachable(appUrl, settings);
  const headers = buildAiHeaders(settings);
  const endpoint = `${appUrl}/api/ai/generate`;

  // Always fetch the latest profile so any experiences added since the last
  // manual sync are included (stale cache is the most common cause of missing entries).
  try {
    const fresh = await syncProfileFromApp(appUrl);
    if (fresh.profile && Array.isArray(fresh.profile.experience)) {
      profile = fresh.profile;
    }
  } catch {
    // Fall back to the cached profile if the server is unreachable
  }

  const allExperienceIds = (profile.experience ?? []).map((e) => e.id);
  const allProjectIds = (profile.projects ?? []).map((p) => p.id);

  // Single call: AI picks the best 4 exp + 2 proj AND rewrites their bullets
  const resume = await callGenerate(endpoint, headers, {
    kind: "resume",
    mode: "bullets",
    selectBest: true,
    jd: jd || "",
    profile,
    skillsMd,
  });

  // Validate IDs returned by the AI; pad to 4/2 with remaining profile entries
  // if the model returned fewer than required (or returned invalid IDs)
  let selectedExperienceIds = Array.isArray(resume.selectedExperienceIds)
    ? resume.selectedExperienceIds.filter((id) => allExperienceIds.includes(id)).slice(0, 4)
    : [];
  if (selectedExperienceIds.length < 4) {
    const rest = allExperienceIds.filter((id) => !selectedExperienceIds.includes(id));
    selectedExperienceIds = [...selectedExperienceIds, ...rest].slice(0, 4);
  }

  let selectedProjectIds = Array.isArray(resume.selectedProjectIds)
    ? resume.selectedProjectIds.filter((id) => allProjectIds.includes(id)).slice(0, 2)
    : [];
  if (selectedProjectIds.length < 2) {
    const rest = allProjectIds.filter((id) => !selectedProjectIds.includes(id));
    selectedProjectIds = [...selectedProjectIds, ...rest].slice(0, 2);
  }

  const pdfRes = await fetch(`${appUrl}/api/extension/resume-pdf`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile,
      experienceBulletsById: resume.experienceBulletsById ?? {},
      projectBulletsById: resume.projectBulletsById ?? {},
      selectedExperienceIds,
      selectedProjectIds,
      subsetEnabled: true,
    }),
  });

  if (!pdfRes.ok) {
    const text = await pdfRes.text();
    throw new Error(`PDF build failed (${pdfRes.status}): ${text.slice(0, 400)}`);
  }

  const buf = await pdfRes.arrayBuffer();
  const pdfBase64 = arrayBufferToBase64(buf);

  return {
    resume,
    pdfBase64,
    filename: "resume-tailored.pdf",
    pages: Number(pdfRes.headers.get("X-Resume-Pages") || 1),
    bulletsDropped: Number(pdfRes.headers.get("X-Resume-Bullets-Trimmed") || 0),
  };
}

async function handleExtractJdKeywordsDeterministic({ jd, settings }) {
  const appUrl = (settings?.appUrl || "http://localhost:3000").replace(/\/$/, "");
  const res = await fetch(`${appUrl}/api/jd/extract-keywords`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jd: (jd || "").slice(0, 12000) }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Keyword extraction failed (${res.status}): ${text.slice(0, 400)}`);
  }

  const data = await res.json();
  const keywords = Array.isArray(data?.keywords)
    ? data.keywords.filter((k) => typeof k === "string" && k.trim().length > 0)
    : [];
  return { keywords };
}

async function callGenerate(endpoint, headers, body) {
  const res = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      text.trim().slice(0, 1200) || `AI call failed (${res.status})`,
    );
  }
  return res.json();
}

/** PUT the full applicationAnswerDocs list to the workspace, saving new Q&A templates. */
async function saveQaTemplates({ appUrl, applicationAnswerDocs }) {
  const base = (appUrl || "http://localhost:3000").replace(/\/$/, "");
  const { workspaceStorageMode } = await chrome.storage.local.get("workspaceStorageMode");
  if (workspaceStorageMode === "local") {
    const saved = await deviceWorkspaceFromApp(base, applicationAnswerDocs);
    if (!saved?.snapshot || saved.mode === "cloud") throw new Error("Open your device workspace in the app and reconnect before saving answers.");
    return { workspace: saved.snapshot.workspace };
  }
  const res = await fetch(`${base}/api/database/workspace/me`, {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ applicationAnswerDocs }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Save failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

/**
 * Generate a single AI answer for an inline button click on the job page.
 * Loads profile + settings from storage so the content script doesn't need them.
 */
async function handleGenerateFieldAnswer({ question, jd, customInstructions, maxChars, maxWords }) {
  const stored = await chrome.storage.local.get([
    "appUrl", "profile", "aiProvider", "geminiApiKey", "groqApiKey", "groqModel",
    "ollamaBaseUrl", "ollamaModel", "skillsMd", "personalContext",
  ]);

  if (!stored.profile?.name?.trim()) {
    throw new Error("Profile not synced. Open the extension sidebar and click Connect & Sync.");
  }

  const settings = {
    appUrl: (stored.appUrl || "http://localhost:3000").replace(/\/$/, ""),
    aiProvider: stored.aiProvider || "ollama",
    geminiApiKey: stored.geminiApiKey || "",
    groqApiKey: stored.groqApiKey || "",
    groqModel: stored.groqModel || "openai/gpt-oss-120b",
    ollamaBaseUrl: stored.ollamaBaseUrl || "http://127.0.0.1:11434",
    ollamaModel: stored.ollamaModel || "llama3.2",
  };

  await assertOllamaReachable(settings.appUrl, settings);

  const result = await callGenerate(`${settings.appUrl}/api/ai/generate`, buildAiHeaders(settings), {
    kind: "applicationAnswer",
    jd: jd || "",
    profile: stored.profile,
    skillsMd: stored.skillsMd || "",
    personalContext: stored.personalContext || "",
    applicationQuestion: question,
    draftAnswer: "",
    customInstructions: customInstructions || "",
    maxChars: maxChars || 0,
    maxWords: maxWords || 0,
  });

  return { optimizedAnswer: result.optimizedAnswer || "" };
}

/** Generate AI answers for a list of questions only — no resume/cover-letter generation. */
async function handleGenerateAnswers({ jd, questions, profile, settings }) {
  const appUrl = (settings.appUrl || "http://localhost:3000").replace(/\/$/, "");
  const skillsMd = settings.skillsMd || "";
  const personalContext = settings.personalContext || "";
  const headers = buildAiHeaders(settings);
  const endpoint = `${appUrl}/api/ai/generate`;

  if (!questions?.length) return { answers: [] };

  await assertOllamaReachable(appUrl, settings);

  const answers = await Promise.all(
    questions.map((q) =>
      callGenerate(endpoint, headers, {
        kind: "applicationAnswer",
        jd: jd || "",
        profile,
        skillsMd,
        personalContext,
        applicationQuestion: q.label,
        draftAnswer: q.templateAnswer || "",
      }).then((result) => ({ ...result, selector: q.selector, label: q.label }))
    )
  );

  return { answers };
}
