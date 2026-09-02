/**
 * content.js — Content Script
 *
 * Injected into every page. Handles three jobs:
 *  1. TOGGLE_OVERLAY / HIDE_OVERLAY — show/hide the floating panel iframe.
 *  2. SCRAPE  — extract JD text + application form fields.
 *  3. AUTOFILL — inject AI-generated answers into matched fields.
 */

(() => {
  // Guard against double-injection. Must run before any const/func decls.
  if (window.__resumeOptimizerInjected) return;
  window.__resumeOptimizerInjected = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "TOGGLE_OVERLAY") {
      toggleOverlay();
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "HIDE_OVERLAY") {
      setOverlayVisible(false);
      sendResponse({ ok: true });
      return;
    }
    if (message.type === "SCRAPE") {
      const result = scrapePage();
      cachedScrape = result;
      sendResponse(result);
      return;
    }
    if (message.type === "GET_LAST_SCRAPE") {
      if (cachedScrape) {
        sendResponse(cachedScrape);
      } else {
        const result = scrapePage();
        cachedScrape = result;
        sendResponse(result);
      }
      return;
    }
    if (message.type === "AUTOFILL") {
      autofill(message.answers)
        .then(({ filled, skipped }) => sendResponse({ ok: true, filled, skipped }))
        .catch(() => sendResponse({ ok: true, filled: 0, skipped: (message.answers || []).length }));
      return true; // keep port open for async response
    }
    if (message.type === "ATTACH_RESUME_PDF") {
      const result = attachResumePdf(message.selector, message.base64Pdf, message.filename);
      sendResponse(result);
      return;
    }
    if (message.type === "FILL_WORK_EXPERIENCE") {
      fillWorkExperience(message.experiences || [])
        .then((res) => sendResponse({ ok: true, ...res }))
        .catch((e) => sendResponse({ error: String(e?.message || e) }));
      return true; // async
    }
  });

  // Listen for postMessage from the sidebar iframe (e.g. close button)
  window.addEventListener("message", (event) => {
    if (event.data?.type === "RO_CLOSE") setOverlayVisible(false);
  });

  // Automatic silent sync from web app localStorage when browsing the app
  try {
    const rawWorkspace = localStorage.getItem("resume-optimizer-workspace-v1");
    if (rawWorkspace) {
      const data = JSON.parse(rawWorkspace);
      if (data?.profile) {
        chrome.runtime.sendMessage({
          type: "AUTO_SYNC_LOCAL_WORKSPACE",
          payload: {
            profile: data.profile,
            applicationAnswerDocs: data.applicationAnswerDocs || [],
          },
        }).catch(() => {});
      }
    }
  } catch {
    // Ignore non-app pages
  }

  // Automatically scrape page on load & notify extension sidebar
  setTimeout(() => {
    try {
      const scraped = scrapePage();
      cachedScrape = scraped;
      chrome.runtime.sendMessage({
        type: "AUTO_DETECTED",
        payload: scraped,
      }).catch(() => {});
    } catch {
      // ignore
    }
  }, 500);

// ─── Overlay ──────────────────────────────────────────────────────────────────

const OVERLAY_ID = "resume-optimizer-overlay";
const PILL_ID = "resume-optimizer-pill";

function toggleOverlay() {
  const overlay = document.getElementById(OVERLAY_ID);
  const isOpen = overlay && overlay.style.display !== "none";
  setCollapsed(isOpen ? true : false);
}

function setOverlayVisible(visible) {
  setCollapsed(!visible);
}

function setCollapsed(collapsed) {
  if (collapsed) {
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) overlay.style.display = "none";
    createPill();
  } else {
    const pill = document.getElementById(PILL_ID);
    if (pill) pill.style.display = "none";
    const overlay = document.getElementById(OVERLAY_ID);
    if (overlay) {
      overlay.style.display = "block";
    } else {
      createOverlay();
    }
  }
}

const PILL_POSITION_KEY = "ro_pill_position_v1";
const PILL_SIZE = 48;
const DRAG_THRESHOLD_PX = 4;

function loadPillPosition() {
  try {
    const raw = localStorage.getItem(PILL_POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.left === "number" && typeof parsed?.top === "number") {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function savePillPosition(left, top) {
  try {
    localStorage.setItem(PILL_POSITION_KEY, JSON.stringify({ left, top }));
  } catch {
    // ignore quota / security errors
  }
}

function clampPillPosition(left, top) {
  const maxLeft = Math.max(0, window.innerWidth - PILL_SIZE - 8);
  const maxTop = Math.max(0, window.innerHeight - PILL_SIZE - 8);
  return {
    left: Math.min(Math.max(8, left), maxLeft),
    top: Math.min(Math.max(8, top), maxTop),
  };
}

function applyPillPosition(pill, pos) {
  pill.style.left = `${pos.left}px`;
  pill.style.top = `${pos.top}px`;
  pill.style.right = "auto";
  pill.style.bottom = "auto";
}

function createPill() {
  const existing = document.getElementById(PILL_ID);
  if (existing) {
    existing.style.display = "flex";
    return existing;
  }

  const pill = document.createElement("button");
  pill.id = PILL_ID;
  pill.type = "button";
  pill.title = "Open Resume Optimizer (drag to move)";
  pill.setAttribute("aria-label", "Open Resume Optimizer");
  pill.style.cssText = `
    position: fixed !important;
    left: auto !important;
    top: auto !important;
    bottom: 20px !important;
    right: 20px !important;
    width: ${PILL_SIZE}px !important;
    height: ${PILL_SIZE}px !important;
    border-radius: 50% !important;
    background: #7c3aed !important;
    color: #ffffff !important;
    z-index: 2147483647 !important;
    box-shadow: 0 8px 24px rgba(0,0,0,0.22) !important;
    cursor: grab !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif !important;
    font-size: 20px !important;
    font-weight: 700 !important;
    letter-spacing: -0.02em !important;
    border: none !important;
    padding: 0 !important;
    transform: scale(1) !important;
    transition: transform 0.15s ease, box-shadow 0.15s ease !important;
    user-select: none !important;
    touch-action: none !important;
  `;
  pill.textContent = "R";

  // Restore persisted position, if any.
  const saved = loadPillPosition();
  if (saved) applyPillPosition(pill, clampPillPosition(saved.left, saved.top));

  pill.addEventListener("mouseenter", () => {
    if (!pill.dataset.dragging) {
      pill.style.transform = "scale(1.08)";
      pill.style.boxShadow = "0 10px 28px rgba(0,0,0,0.28)";
    }
  });
  pill.addEventListener("mouseleave", () => {
    pill.style.transform = "scale(1)";
    pill.style.boxShadow = "0 8px 24px rgba(0,0,0,0.22)";
  });

  // ─── Drag handling ────────────────────────────────────────────────
  let dragState = null; // { startX, startY, originLeft, originTop, moved }

  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return; // left click only
    const rect = pill.getBoundingClientRect();
    dragState = {
      startX: e.clientX,
      startY: e.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      moved: false,
    };
    pill.setPointerCapture?.(e.pointerId);
    pill.style.transition = "none";
    pill.style.cursor = "grabbing";
    e.preventDefault();
  };

  const onPointerMove = (e) => {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    if (!dragState.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    dragState.moved = true;
    pill.dataset.dragging = "1";

    const next = clampPillPosition(
      dragState.originLeft + dx,
      dragState.originTop + dy
    );
    applyPillPosition(pill, next);
  };

  const onPointerUp = (e) => {
    if (!dragState) return;
    const wasDrag = dragState.moved;
    try {
      pill.releasePointerCapture?.(e.pointerId);
    } catch {}
    pill.style.transition = "transform 0.15s ease, box-shadow 0.15s ease";
    pill.style.cursor = "grab";

    if (wasDrag) {
      const rect = pill.getBoundingClientRect();
      const snapped = clampPillPosition(rect.left, rect.top);
      applyPillPosition(pill, snapped);
      savePillPosition(snapped.left, snapped.top);
      // Prevent the synthetic click that may follow.
      setTimeout(() => {
        delete pill.dataset.dragging;
      }, 0);
    } else {
      delete pill.dataset.dragging;
    }
    dragState = null;
  };

  pill.addEventListener("pointerdown", onPointerDown);
  pill.addEventListener("pointermove", onPointerMove);
  pill.addEventListener("pointerup", onPointerUp);
  pill.addEventListener("pointercancel", onPointerUp);

  pill.addEventListener("click", (e) => {
    // If the mouseup ended a drag, swallow the click.
    if (pill.dataset.dragging) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setCollapsed(false);
  });

  // Keep it inside the viewport if the window resizes.
  window.addEventListener("resize", () => {
    const rect = pill.getBoundingClientRect();
    if (rect.left === 0 && rect.top === 0) return; // not positioned yet
    const next = clampPillPosition(rect.left, rect.top);
    applyPillPosition(pill, next);
  });

  document.documentElement.appendChild(pill);
  return pill;
}

function createOverlay() {
  document.getElementById(OVERLAY_ID)?.remove();

  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = `
    position: fixed !important;
    top: 12px !important;
    right: 12px !important;
    bottom: auto !important;
    width: 380px !important;
    height: min(80vh, 720px) !important;
    max-height: calc(100vh - 24px) !important;
    z-index: 2147483647 !important;
    box-shadow: 0 12px 40px rgba(0,0,0,0.22) !important;
    background: transparent !important;
    border: none !important;
    border-radius: 14px !important;
    overflow: hidden !important;
    display: block !important;
    pointer-events: auto !important;
  `;

  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("sidebar/sidebar.html");
  iframe.style.cssText = `
    width: 100% !important;
    height: 100% !important;
    border: none !important;
    display: block !important;
    background: transparent !important;
  `;
  iframe.allow = "clipboard-write";
  iframe.title = "Resume Optimizer";

  overlay.appendChild(iframe);
  document.documentElement.appendChild(overlay);
}

// ─── Auto-detection ──────────────────────────────────────────────────────────

let cachedScrape = null;

// Hostnames that are known ATS / job board / careers domains. Match suffix.
const KNOWN_ATS_HOST_PATTERNS = [
  /(^|\.)greenhouse\.io$/i,
  /(^|\.)lever\.co$/i,
  /(^|\.)myworkdayjobs\.com$/i,
  /(^|\.)workday\.com$/i,
  /(^|\.)ashbyhq\.com$/i,
  /(^|\.)workable\.com$/i,
  /(^|\.)smartrecruiters\.com$/i,
  /(^|\.)icims\.com$/i,
  /(^|\.)recruitee\.com$/i,
  /(^|\.)jobvite\.com$/i,
  /(^|\.)bamboohr\.com$/i,
  /(^|\.)taleo\.net$/i,
  /(^|\.)oraclecloud\.com$/i,
  /(^|\.)successfactors\.(com|eu)$/i,
  /(^|\.)breezy\.hr$/i,
  /(^|\.)teamtailor\.com$/i,
  /(^|\.)pinpointhq\.com$/i,
  /(^|\.)rippling\.com$/i,
];

const APPLICATION_PATH_PATTERNS = [
  /\/apply(\/|$|\?)/i,
  /\/application(\/|$|\?)/i,
  /\/jobs?\//i,
  /\/careers?\//i,
  /\/positions?\//i,
];

// CSS markers for ATS-specific markup, even when embedded on a custom domain.
const ATS_DOM_MARKERS = [
  // Greenhouse
  "#application_form",
  "#application_questions",
  "#custom_questions",
  "[class*='application--questions']",
  "iframe[src*='greenhouse.io']",
  // Lever
  ".posting-form",
  ".application-form",
  // Workday
  "[data-automation-id='jobApplicationForm']",
  "[data-automation-id*='question']",
  "[data-automation-id^='formField']",
  // Ashby
  "[class*='_ashby']",
  "[class*='ashby-application']",
  // Workable
  "form[action*='workable']",
  // SmartRecruiters
  "[data-test='job-application-form']",
  // iCIMS
  "form[id*='icims']",
];

function isKnownAts() {
  const host = location.hostname || "";
  if (KNOWN_ATS_HOST_PATTERNS.some((re) => re.test(host))) return true;
  for (const sel of ATS_DOM_MARKERS) {
    try {
      if (document.querySelector(sel)) return true;
    } catch {
      // bad selector — skip
    }
  }
  return false;
}

function looksLikeApplicationPage() {
  return APPLICATION_PATH_PATTERNS.some((re) => re.test(location.pathname));
}

let autoScrapeTimer = null;
function scheduleAutoScrape(delayMs = 600) {
  clearTimeout(autoScrapeTimer);
  autoScrapeTimer = setTimeout(() => {
    try {
      runAutoScrape();
    } catch (e) {
      console.warn("[Resume Optimizer] Auto-scrape failed:", e);
    }
  }, delayMs);
}

function runAutoScrape() {
  if (!isKnownAts() && !looksLikeApplicationPage()) return;

  // Make the floating pill visible the moment we recognize an ATS page so the
  // extension is "active" without the user clicking the toolbar icon. Idempotent.
  ensurePillForAtsPage();

  const result = scrapePage();

  // Skip noisy updates: must have at least one field OR non-trivial JD.
  const fieldCount = result.fields?.length || 0;
  const jdLen = (result.jd || "").length;
  const resumeFileCount = result.resumeFileInputs?.length || 0;
  if (fieldCount === 0 && jdLen < 200 && resumeFileCount === 0) return;

  // Skip if nothing changed since last broadcast.
  const sig = `${fieldCount}::${jdLen}::${resumeFileCount}::${result.url}`;
  if (cachedScrape && cachedScrape.__sig === sig) return;

  result.__sig = sig;
  cachedScrape = result;

  // Inject AI generate buttons on essay fields whenever the page state changes.
  injectEssayButtons(result.fields || []);

  // Notify any open sidebar(s). Wrapped because the extension may be reloading.
  try {
    if (chrome?.runtime?.id) {
      chrome.runtime
        .sendMessage({ type: "AUTO_DETECTED", payload: result })
        .catch?.(() => {});
    }
  } catch {
    // context invalidated during dev reload — ignore
  }
}

// Auto-show the collapsed pill on detected ATS pages. We never auto-open the
// full overlay (too intrusive) — the pill is a 48px draggable affordance the
// user can click to expand. createPill() / setCollapsed(true) are idempotent
// so this is safe to call repeatedly from the mutation observer.
function ensurePillForAtsPage() {
  // Only auto-show in the top frame; iframes get their own content-script
  // injection but should never render the floating UI.
  if (window.top !== window) return;
  if (!document.body) return;

  // Respect "user dismissed" flag — if they explicitly closed the pill on this
  // host this session, leave it alone. (We don't have a close on the pill yet,
  // so this is a forward-looking guard.)
  try {
    if (sessionStorage.getItem("ro_pill_dismissed_v1") === location.hostname) {
      return;
    }
  } catch {
    // sessionStorage may be blocked on some pages — ignore.
  }

  // If the overlay is currently expanded, leave it alone. Otherwise ensure the
  // pill exists.
  const overlay = document.getElementById(OVERLAY_ID);
  const overlayOpen = overlay && overlay.style.display !== "none";
  if (!overlayOpen) setCollapsed(true);
}

function startAutoDetection() {
  // Show the pill ASAP if this is clearly an ATS page, so the user sees the
  // extension is active even before the first scrape completes.
  if (isKnownAts() || looksLikeApplicationPage()) {
    if (document.body) {
      ensurePillForAtsPage();
    } else {
      document.addEventListener("DOMContentLoaded", ensurePillForAtsPage, { once: true });
    }
  }

  // Initial pass shortly after script injection.
  scheduleAutoScrape(800);

  // Re-scan when the DOM changes substantially (Workday is a SPA, Greenhouse
  // injects the EEOC section after the rest of the form, etc.).
  let observer;
  try {
    observer = new MutationObserver(() => scheduleAutoScrape(700));
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  } catch {
    // ignore
  }

  // Re-scan on SPA navigation (Workday, Ashby, etc.)
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      cachedScrape = null;
      scheduleAutoScrape(900);
    }
  }, 1500);

  // Also re-scan after window load for safety.
  if (document.readyState === "complete") {
    scheduleAutoScrape(1200);
  } else {
    window.addEventListener("load", () => scheduleAutoScrape(1200), { once: true });
  }
}

// Kick off auto-detection. Safe even on non-ATS pages — gated inside.
startAutoDetection();

// ─── Scraping ───

function scrapePage() {
  const result = {
    jd: extractJobDescription(),
    fields: extractFormFields(),
    resumeFileInputs: extractResumeFileInputs(),
    url: location.href,
    title: document.title,
    site: detectSite(),
  };
  console.log("[Resume Optimizer] Scraped:", result);
  return result;
}

let persistentJdCache = "";
let isFetchingRootJd = false;

function getJobKey() {
  const cleanPath = location.pathname.replace(/\/application\b|\/apply\b|\/thanks\b/i, "");
  return `${location.hostname}${cleanPath}`;
}

function getRootJobUrl() {
  const cleanPath = location.pathname.replace(/\/application\b|\/apply\b|\/thanks\b/i, "");
  return `${location.origin}${cleanPath}`;
}

function saveJdToStorage(jdText) {
  if (!jdText || jdText.length < 250) return;
  persistentJdCache = jdText;
  try {
    const key = `ro_jd_${getJobKey()}`;
    sessionStorage.setItem(key, jdText);
    sessionStorage.setItem("ro_last_jd", jdText);
  } catch {}
}

function loadJdFromStorage() {
  try {
    const key = `ro_jd_${getJobKey()}`;
    const cached = sessionStorage.getItem(key) || sessionStorage.getItem("ro_last_jd");
    if (cached && cached.length > 200) return cached;
  } catch {}
  return persistentJdCache;
}

/** Extract JD directly from embedded JSON script tags (Next.js __NEXT_DATA__, JSON-LD, etc.) */
function extractJdFromScriptTags() {
  try {
    // 1. Next.js data script (Ashby, Greenhouse Next apps)
    const nextDataEl = document.getElementById("__NEXT_DATA__");
    if (nextDataEl) {
      const jsonStr = nextDataEl.textContent || "";
      if (jsonStr.includes("description") || jsonStr.includes("jobPosting")) {
        const matches = jsonStr.match(/"description(?:Html|Plain)?":"([^"]{200,12000})"/i);
        if (matches && matches[1]) {
          const cleanText = matches[1]
            .replace(/\\n/g, "\n")
            .replace(/\\r/g, "")
            .replace(/\\"/g, '"')
            .replace(/\\t/g, " ")
            .replace(/<[^>]+>/g, " ");
          if (cleanText.trim().length > 150) {
            return truncate(cleanText.trim(), 8000);
          }
        }
      }
    }

    // 2. Schema.org JobPosting JSON-LD
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent);
        const obj = Array.isArray(data) ? data.find((x) => x && x["@type"] === "JobPosting") : (data && data["@type"] === "JobPosting" ? data : null);
        if (obj && obj.description) {
          const cleanText = String(obj.description).replace(/<[^>]+>/g, " ").trim();
          if (cleanText.length > 150) return truncate(cleanText, 8000);
        }
      } catch {}
    }
  } catch {}
  return "";
}

/** Background fetch root job posting HTML if viewing /application directly */
function fetchRootJdBackground() {
  const rootUrl = getRootJobUrl();
  if (isFetchingRootJd || !rootUrl || rootUrl === location.href) return;
  isFetchingRootJd = true;

  fetch(rootUrl, { credentials: "same-origin" })
    .then((res) => res.text())
    .then((html) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      let text = "";
      const nextScript = doc.getElementById("__NEXT_DATA__");
      if (nextScript) {
        const jsonStr = nextScript.textContent || "";
        const matches = jsonStr.match(/"description(?:Html|Plain)?":"([^"]{200,12000})"/i);
        if (matches && matches[1]) {
          text = matches[1].replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/<[^>]+>/g, " ");
        }
      }
      if (!text || text.length < 150) {
        const descEl = doc.querySelector('[class*="_description_"], [class*="description"], .job-post-container, .posting-description, main');
        if (descEl) {
          text = descEl.innerText.trim();
        }
      }
      if (text && text.length > 150) {
        const truncated = truncate(text.trim(), 8000);
        saveJdToStorage(truncated);
        scheduleAutoScrape(100);
      }
    })
    .catch(() => {})
    .finally(() => {
      isFetchingRootJd = false;
    });
}

/**
 * Extract the job description text from the page.
 * Uses 4-level recovery: session cache -> embedded script tags (__NEXT_DATA__) -> DOM scan -> root URL fetch.
 */
function extractJobDescription() {
  const isAppPath = /\/(application|apply|submission)\b/i.test(location.pathname) || location.hash.includes("app");
  const stored = loadJdFromStorage();

  // 1. If stored session JD exists (>= 250 chars), use it immediately
  if (stored && stored.length >= 250) {
    return stored;
  }

  // 2. Extract directly from embedded script tags (__NEXT_DATA__ / JSON-LD)
  const scriptJd = extractJdFromScriptTags();
  if (scriptJd && scriptJd.length >= 200) {
    saveJdToStorage(scriptJd);
    return scriptJd;
  }

  // 3. Scan DOM containers for job posting text
  const siteSelectors = [
    '[class*="_description_"]',
    '[class*="description"]',
    '[class*="JobPosting"]',
    '[class*="jobDescription"]',
    '[class*="ashby"]',
    ".job-post-container",
    "#content .posting-headline ~ div",
    ".posting-body",
    ".posting-description",
    ".posting-header",
    '[data-automation-id="jobPostingDescription"]',
    '[data-automation-id="jobPostingDescriptionText"]',
    '[data-automation-id="job-posting-details"]',
    ".jobs-description__content",
    ".jobs-box__html-content",
    "#jobDescriptionText",
    ".jobsearch-jobDescriptionText",
    ".job-description",
    '[data-job-description]',
    'article[class*="job"]',
    '[class*="job-detail"]',
    '[class*="jobDetail"]',
    '[id*="job-description"]',
    '[id*="jobDescription"]',
  ];

  for (const sel of siteSelectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const clone = el.cloneNode(true);
        clone.querySelectorAll("form, input, textarea, select, button, nav, header, footer").forEach((node) => node.remove());
        const text = clone.innerText.trim();
        if (text.length >= 250) {
          const truncated = truncate(text, 8000);
          saveJdToStorage(truncated);
          return truncated;
        }
      }
    } catch {
      // skip
    }
  }

  // 4. If on an application subpage and no JD found yet, trigger background fetch of root posting URL
  if (isAppPath) {
    fetchRootJdBackground();
  }

  return stored || "";
}

/**
 * Scan within known "application questions" containers and return every
 * visible input/textarea that has a descriptive label. Much more permissive
 * than the generic scan because we trust the container.
 */
// Labels that are basic PII / navigation, skipped during the wide ATS fallback
// scan (but kept when scanning an explicit, trusted question container).
function isPiiOrNavLabel(label) {
  return /^(first name|last name|full name|middle name|preferred name|name|email|e-mail|phone|mobile|address|street|city|state|province|zip|postal|country|search|date of birth)\b/i.test(
    (label || "").trim()
  );
}

/**
 * Dynamically extract question field options from page JSON script tags (__NEXT_DATA__ / window JSON)
 * by matching key words of the question title. Zero hardcoded strings.
 */
function extractOptionsFromPageJson(fieldLabel) {
  if (!fieldLabel || fieldLabel.length < 3) return [];
  try {
    const nextDataEl = document.getElementById("__NEXT_DATA__");
    if (!nextDataEl) return [];
    const jsonStr = nextDataEl.textContent || "";
    if (!jsonStr) return [];

    const STOP = new Set([
      "us", "usa", "candidates", "only", "please", "select", "one", "indicate",
      "outlined", "the", "and", "you", "your", "are", "have", "with", "for", "in"
    ]);
    const getWords = (s) =>
      String(s || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !STOP.has(w));

    const targetWords = getWords(fieldLabel);
    if (!targetWords.length) return [];

    const jsonParsed = JSON.parse(jsonStr);
    let foundOptions = [];

    const findInObj = (obj) => {
      if (!obj || typeof obj !== "object" || foundOptions.length > 0) return;
      if (Array.isArray(obj)) {
        for (const item of obj) findInObj(item);
        return;
      }

      const rawOpts = obj.options || obj.selectableValues || obj.choices || obj.values || obj.items || obj.fieldOptions;
      if (Array.isArray(rawOpts) && rawOpts.length >= 2) {
        const title = String(obj.title || obj.label || obj.name || obj.prompt || obj.question || "").toLowerCase();
        const objWords = new Set(getWords(title));

        const overlap = targetWords.filter((w) => objWords.has(w)).length;
        const matchRatio = overlap / Math.max(1, targetWords.length);

        if (overlap >= 2 || (targetWords.length === 1 && overlap === 1) || matchRatio >= 0.35) {
          const list = rawOpts
            .map((opt) => (typeof opt === "string" ? opt : (opt?.label || opt?.text || opt?.value || opt?.title || "")))
            .map((s) => String(s).trim())
            .filter((s) => s && !isPlaceholderText(s) && s.length < 250);
          if (list.length >= 2) {
            foundOptions = list;
            return;
          }
        }
      }

      for (const k of Object.keys(obj)) {
        findInObj(obj[k]);
      }
    };

    findInObj(jsonParsed);
    if (foundOptions.length >= 2) return Array.from(new Set(foundOptions)).slice(0, 25);
  } catch {}
  return [];
}

/**
 * Get immediate field container for an input element, preventing over-climbing to
 * parent containers that hold multiple different question fields.
 */
const CHOICE_SEL =
  'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]';

// Values a widget uses as its own default rather than as a real answer.
const NOISE_VALUES = new Set(["on", "off", "true", "false", "value"]);

// Wrappers that hold exactly one question (label + its control(s)).
const FIELD_CONTAINER_SEL = [
  "[data-field-path]",
  "[data-field-entry-id]",
  "fieldset",
  "[role='radiogroup']",
  "[role='group']",
  "[class*='_fieldEntry_']",
  "[class*='ashby-application-form-field-entry']",
  "[class*='form-group']",
  "[class*='formGroup']",
  "[data-automation-id^='formField']",
].join(", ");

/** The single-question wrapper `el` lives in, if any. */
function getFieldContainer(el) {
  return el?.closest?.(FIELD_CONTAINER_SEL) || null;
}

function countChoiceInputsByName(name) {
  if (!name) return 0;
  try {
    return document.querySelectorAll(`input${safeAttrSelector("name", name)}`).length;
  } catch {
    return 0;
  }
}

/**
 * Identify the choice group an option belongs to, plus a stable selector for it.
 *
 * `name` groups radios, but Ashby names each checkbox after its own option text
 * ("East Asian", "South Asian", …), so there `name` identifies one option rather
 * than the group — fall back to the field container whenever it holds more.
 */
function getChoiceGroupRef(el) {
  const container = getFieldContainer(el);
  const name = el.getAttribute?.("name") || "";
  const byName = countChoiceInputsByName(name);
  const byContainer = container ? container.querySelectorAll(CHOICE_SEL).length : 0;

  if (container && byContainer > byName) {
    const selector = getUniqueSelector(container);
    return { key: `container:${selector}`, selector, container };
  }
  if (name && byName > 0) {
    return { key: `name:${name}`, selector: `input${safeAttrSelector("name", name)}`, container };
  }
  const selector = getUniqueSelector(el);
  return { key: `input:${selector}`, selector, container };
}

/** Every option belonging to the same choice group as `el`. */
function getChoiceGroupInputs(el) {
  const name = el.getAttribute?.("name") || "";
  if (name) {
    let byName = [];
    try {
      byName = Array.from(document.querySelectorAll(`input${safeAttrSelector("name", name)}`));
    } catch {
      byName = [];
    }
    if (byName.length > 1) return byName;
  }

  const container = getFieldContainer(el);
  if (container) {
    const inputs = Array.from(container.querySelectorAll(CHOICE_SEL));
    if (inputs.length) return inputs;
  }
  return [el];
}

/**
 * Stable per-question key, so two scan passes describing the same field with
 * different selectors (id vs name vs container) collapse into one entry.
 * Returns null when the wrapper holds more than one question.
 */
function getQuestionKey(el) {
  const container = getFieldContainer(el);
  if (!container) return null;
  const controls = container.querySelectorAll(
    'textarea, select, input:not([type="hidden"]):not([type="radio"]):not([type="checkbox"]), [role="combobox"], [role="textbox"]'
  );
  const choices = container.querySelectorAll(CHOICE_SEL);
  if (controls.length > 1) return null;
  if (controls.length === 1 && choices.length > 0) return null;
  // A wrapper holding two independent choice groups holds two questions.
  if (choices.length > 1) {
    const groups = new Set(Array.from(choices, (c) => getChoiceGroupRef(c).key));
    if (groups.size > 1) return null;
  }
  return getUniqueSelector(container);
}

function getImmediateFieldContainer(inputEl) {
  let curr = inputEl.parentElement;
  while (curr && curr !== document.body && curr.tagName !== "FORM") {
    const isFieldBlock = curr.matches(
      "fieldset, [role='radiogroup'], [class*='_field_'], [class*='field'], [class*='question'], [class*='form-group'], [class*='formGroup']"
    );
    if (isFieldBlock) {
      const otherInputs = curr.querySelectorAll("textarea, select, [role='textbox']");
      if (otherInputs.length <= 1) {
        return curr;
      }
    }
    curr = curr.parentElement;
  }
  return inputEl.parentElement;
}

/**
 * Extract available option choices for a field dynamically from DOM or page JSON.
 * No hardcoded preset strings.
 */
function getFieldOptions(inputEl, explicitWrapper, fieldLabel = "") {
  // 1. Try dynamic JSON extraction first (Ashby & Greenhouse embed full choice definitions in page JSON)
  const jsonOptions = extractOptionsFromPageJson(fieldLabel);

  // 2. Native <select>
  if (inputEl && inputEl.tagName === "SELECT") {
    const options = [];
    Array.from(inputEl.options).forEach((opt) => {
      const txt = (opt.text || opt.value || "").trim();
      if (txt && !isPlaceholderText(txt) && txt.length < 300) {
        options.push(txt);
      }
    });
    const selectOpts = Array.from(new Set(options));
    if (selectOpts.length >= (jsonOptions.length || 2)) return selectOpts.slice(0, 25);
  }

  // 3. Immediate field wrapper container choice scan
  const domOptions = [];
  if (inputEl) {
    const wrapper = explicitWrapper || getImmediateFieldContainer(inputEl);
    if (wrapper) {
      const heading = wrapper.querySelector(
        "legend, h1, h2, h3, h4, [class*='question-label'], [class*='application-label'], [class*='label'], [class*='title'], [class*='heading']"
      );

      const items = wrapper.querySelectorAll(
        'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], [role="option"], button, [class*="_option_"]'
      );

      for (const item of items) {
        if (heading && heading.contains(item)) continue;

        let txt = "";
        if (item.tagName === "INPUT") {
          txt = getChoiceOptionLabel(item);
        } else {
          const clone = item.cloneNode(true);
          clone.querySelectorAll("input, select, textarea, svg").forEach((c) => c.remove());
          txt = (clone.innerText || item.getAttribute("aria-label") || item.getAttribute("title") || "").trim();
        }
        if (
          txt &&
          !isPlaceholderText(txt) &&
          !NOISE_VALUES.has(txt.toLowerCase()) &&
          txt.length < 250
        ) {
          domOptions.push(txt);
        }
      }
    }
  }

  const uniqueDom = Array.from(new Set(domOptions));

  // If JSON extraction found more choices than partial DOM buttons (e.g. 4 choices vs 2 partial buttons), use JSON!
  if (jsonOptions.length > uniqueDom.length) {
    return jsonOptions;
  }
  if (uniqueDom.length >= 2) {
    return uniqueDom.slice(0, 25);
  }

  return jsonOptions.slice(0, 25);
}

function extractQuestionsFromContainers(roots, seen, opts = {}) {
  const { filterPii = false } = opts;
  const fields = [];

  for (const root of roots) {
    // 1. Text-like inputs + selects + custom dropdowns
    const inputs = root.querySelectorAll(
      'textarea, input[type="text"], input[type="search"], input[type="url"], input[type="tel"], input[type="email"], input[type="number"], input:not([type]), div[contenteditable="true"], div[contenteditable=""], [role="textbox"], [role="combobox"], [role="spinbutton"], select, button[aria-haspopup="listbox"], [data-automation-id="selectinput"], [data-uxi-widget-type="selectinput"]'
    );

    for (const input of inputs) {
      if (!isVisible(input)) continue;

      const label = getFieldLabel(input);
      if (!label || label.length < 3) continue;
      if (filterPii && isPiiOrNavLabel(label)) continue;

      const selector = getUniqueSelector(input);
      if (seen.has(selector)) continue;
      seen.add(selector);

      fields.push({
        label: label.slice(0, 400),
        selector,
        questionKey: getQuestionKey(input),
        currentValue: (input.value || input.innerText || "").trim(),
        isContentEditable:
          input.getAttribute?.("contenteditable") === "true" ||
          input.getAttribute?.("contenteditable") === "",
        options: getFieldOptions(input, null, label),
      });
    }

    // 2. Choice / Radio / Checkbox / Option groups (EEOC, Demographics, Agreements, Visa, Country, etc.)
    const choiceInputs = root.querySelectorAll(
      'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], [role="option"]'
    );
    const choiceGroups = new Map();

    for (const r of choiceInputs) {
      // Ashby/Greenhouse hide the real input behind a styled span, so judge
      // visibility by the on-screen stand-in rather than the input itself.
      if (!isChoiceVisible(r)) continue;

      const ref = getChoiceGroupRef(r);
      if (!choiceGroups.has(ref.key)) {
        choiceGroups.set(ref.key, { firstInput: r, wrapper: ref.container, selector: ref.selector });
      }
    }

    for (const [, { firstInput, wrapper, selector }] of choiceGroups) {
      const label = getGroupLabel(firstInput);
      if (!label || label.length < 3) continue;
      if (seen.has(selector)) continue;
      seen.add(selector);

      fields.push({
        label: label.slice(0, 400),
        selector,
        questionKey: getQuestionKey(firstInput),
        currentValue: "",
        isContentEditable: false,
        options: getFieldOptions(firstInput, wrapper, label),
      });
    }

    // 3. Field Wrapper Sweep (detects EEOC, Demographics, and Custom Section blocks)
    const wrappers = root.querySelectorAll(
      "fieldset, [role='radiogroup'], [role='group'], div[class*='_field_'], div[class*='_question_'], div[class*='_container_'], div[class*='field'], div[class*='question'], div[class*='form-group'], div[class*='formGroup']"
    );

    for (const wrapper of wrappers) {
      if (!isVisible(wrapper)) continue;
      const heading = wrapper.querySelector(
        "legend, h1, h2, h3, h4, [class*='question-label'], [class*='application-label'], [class*='label'], [class*='title'], [class*='heading'], label"
      );
      if (!heading) continue;
      const clone = heading.cloneNode(true);
      clone.querySelectorAll("input, select, textarea, button").forEach((c) => c.remove());
      const label = clone.innerText?.trim();
      if (!label || label.length < 3 || isPlaceholderText(label)) continue;
      if (filterPii && isPiiOrNavLabel(label)) continue;

      // Find primary input inside wrapper
      const targetInput = wrapper.querySelector(
        'textarea, input, select, [role="combobox"], [role="radio"], [role="checkbox"], [role="option"], button'
      );
      if (!targetInput) continue;

      // Choice groups get the group's own selector, so this pass collapses into
      // the one above rather than describing the same question a second way.
      const selector = isChoiceInput(targetInput)
        ? getChoiceGroupRef(targetInput).selector
        : getUniqueSelector(targetInput);

      if (seen.has(selector)) continue;
      seen.add(selector);

      fields.push({
        label: label.slice(0, 400),
        selector,
        questionKey: getQuestionKey(targetInput),
        currentValue: (targetInput.value || targetInput.innerText || "").trim(),
        isContentEditable:
          targetInput.getAttribute?.("contenteditable") === "true" ||
          targetInput.getAttribute?.("contenteditable") === "",
        options: getFieldOptions(targetInput, wrapper, label),
      });
    }
  }

  return fields;
}

/**
 * Find the question label for a radio/checkbox group. Prefers the nearest
 * <legend> / heading / labelled wrapper — falls back to per-input label.
 */
function getGroupLabel(inputEl) {
  // The field container first: a bare [class*='_container_'] match would land on
  // Ashby's per-option wrapper span and yield the option text as the question.
  const wrapper =
    getFieldContainer(inputEl) ||
    inputEl.closest(
      "fieldset, [role='radiogroup'], [role='group'], .field, [class*='_field_'], [class*='field'], [class*='question'], [class*='custom-question'], div[id*='question'], div[class*='group']"
    );
  if (wrapper) {
    const heading = wrapper.querySelector(
      "legend, h1, h2, h3, h4, [class*='question-label'], [class*='application-label'], [class*='label'], [class*='title'], label"
    );
    if (heading) {
      const clone = heading.cloneNode(true);
      clone.querySelectorAll("input, select, textarea, button").forEach((c) => c.remove());
      const text = clone.innerText?.trim();
      if (text && text.length > 2 && !isPlaceholderText(text)) return text;
    }
  }
  return getFieldLabel(inputEl);
}

function detectSite() {
  const host = location.hostname || "";
  if (
    /(^|\.)ashbyhq\.com$/i.test(host) ||
    document.querySelector('[class*="ashby"], [class*="_ashby"]')
  ) {
    return "ashby";
  }
  if (
    /(^|\.)greenhouse\.io$/i.test(host) ||
    document.querySelector('#application_questions, #application_form, [class*="application--questions"], .select__control')
  ) {
    return "greenhouse";
  }
  if (
    /(^|\.)lever\.co$/i.test(host) ||
    document.querySelector('.posting-form, .application-form')
  ) {
    return "lever";
  }
  if (
    /(^|\.)myworkdayjobs\.com$/i.test(host) ||
    /(^|\.)workday\.com$/i.test(host) ||
    document.querySelector('[data-automation-id="jobApplicationForm"], [data-automation-id^="formField"]')
  ) {
    return "workday";
  }
  if (
    /(^|\.)workable\.com$/i.test(host) ||
    document.querySelector('form[action*="workable"]')
  ) {
    return "workable";
  }
  if (
    /(^|\.)smartrecruiters\.com$/i.test(host) ||
    document.querySelector('[data-test="job-application-form"]')
  ) {
    return "smartrecruiters";
  }
  if (
    /(^|\.)icims\.com$/i.test(host) ||
    document.querySelector('form[id*="icims"]')
  ) {
    return "icims";
  }
  if (/(^|\.)bamboohr\.com$/i.test(host)) return "bamboohr";
  if (/(^|\.)rippling\.com$/i.test(host)) return "rippling";

  return "other";
}

// Containers shared across all sites (EEOC/demographic, education, misc ATS).
const SHARED_CONTAINERS = [
  // EEOC / Voluntary Self-Identification / Disability
  "#eeoc_section", "#disability_section", "#eeo_section",
  "[id*='eeoc']", "[class*='eeoc']", "[class*='voluntary-self']",
  "[class*='self-identification']", "[class*='demographic']", "[class*='application--eeoc']",
  // Education
  "#education_section", "#education", "[id*='education']", "[class*='education']",
  "[data-qa='education']", "[data-automation-id*='educationSection']",
  "[data-automation-id*='Education']", "[class*='application--education']",
  "section[data-field='education']",
  // Other ATS (Lever, Ashby, Workable, SmartRecruiters, iCIMS)
  ".posting-form", ".application-form", ".application-additional", "ul.application-additional",
  "[class*='ashby-application-form']", "[class*='_application']", "[class*='_questionnaire']",
  "form[action*='workable']", "[data-ui='application-form']",
  "[data-test='job-application-form']", "[data-test*='question']",
  "form[id*='icims']", "[id*='applicationQuestions']", "[id*='customQuestion']",
  "[class*='customQuestion']", "[class*='question-block']",
];

// Input types that take free text typed by the user.
const TEXT_INPUT_TYPES = new Set([
  "", "text", "email", "tel", "url", "search", "number", "password",
]);

/** A control that accepts typed text directly (not a dropdown/choice widget). */
function isTextEntryControl(el) {
  if (!el || !el.tagName) return false;
  if (el.getAttribute?.("contenteditable") === "true" || el.getAttribute?.("contenteditable") === "") {
    return true;
  }
  if (isComboboxEl(el)) return false; // typeahead — needs the dropdown flow
  const tag = el.tagName.toUpperCase();
  if (tag === "TEXTAREA") return true;
  if (tag !== "INPUT") return false;
  return TEXT_INPUT_TYPES.has((el.type || "").toLowerCase());
}

/** Any real form control, as opposed to a wrapper div a selector resolved to. */
function isControlEl(el) {
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.getAttribute?.("contenteditable") === "true" || el.getAttribute?.("contenteditable") === "") {
    return true;
  }
  const role = (el.getAttribute?.("role") || "").toLowerCase();
  return ["combobox", "listbox", "textbox", "radio", "checkbox", "spinbutton"].includes(role);
}

/**
 * Generic default fill handler for standard inputs, textareas, selects, and contenteditables.
 */
async function fillDefault(el, text) {
  if (!el) return false;
  const tag = el.tagName.toUpperCase();

  // Contenteditable div/span
  if (el.getAttribute("contenteditable") === "true" || el.getAttribute("contenteditable") === "") {
    return fillContentEditable(el, text);
  }

  // Native <select>
  if (tag === "SELECT") {
    return fillNativeSelect(el, text);
  }

  // Radio or checkbox input / group
  if (el.type === "radio" || el.type === "checkbox" || el.getAttribute("role") === "radio" || el.getAttribute("role") === "checkbox") {
    return fillChoiceGroup(el, text);
  }

  // Textlike inputs and textareas
  return fillTextLike(el, text);
}

function fillContentEditable(el, text) {
  el.focus();
  document.execCommand("selectAll", false, null);
  document.execCommand("insertText", false, text);
  el.dispatchEvent(new InputEvent("input", { bubbles: true }));
  return true;
}

function fillTextLike(el, text) {
  // A file input's value setter throws InvalidStateError — and a résumé upload
  // is never the answer to a question anyway.
  const type = (el.type || "").toLowerCase();
  if (el.tagName === "INPUT" && (type === "file" || type === "submit" || type === "button")) {
    return false;
  }

  el.focus();
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, text); else el.value = text;

  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.dispatchEvent(new Event("blur", { bubbles: true }));
  return true;
}

function fillNativeSelect(el, text) {
  const target = (text || "").trim().toLowerCase();
  let bestOpt = null;
  let bestScore = -1;

  for (const opt of el.options) {
    const val = (opt.value || "").trim().toLowerCase();
    const txt = (opt.text || "").trim().toLowerCase();
    let score = 0;
    if (val === target || txt === target) score = 10;
    else if (txt.startsWith(target) || val.startsWith(target)) score = 8;
    else if (txt.includes(target) || val.includes(target)) score = 5;
    else if (target.includes(txt) && txt.length > 2) score = 3;

    if (score > bestScore) {
      bestScore = score;
      bestOpt = opt;
    }
  }

  if (bestOpt && bestScore > 0) {
    el.value = bestOpt.value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  return false;
}

// "Prefer not to say" is worded differently on every ATS; treat them as equal.
const DECLINE_RE =
  /prefer not|decline|don'?t wish|do not wish|not disclose|rather not|choose not|opt out|not to (?:say|answer|identify)|wish not/i;

/** Split a multi-select answer ("East Asian, South Asian") into its choices. */
function splitMultiAnswer(text) {
  return String(text || "")
    .split(/\s*(?:[;|\n]|,)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Score every option in the group against `text`; return the best one. */
function matchChoiceOption(options, text) {
  const targetText = String(text || "").trim().toLowerCase();
  if (!targetText) return null;

  let best = null;
  let bestScore = 0;

  for (const opt of options) {
    const inputEl = opt.tagName === "INPUT" ? opt : opt.querySelector?.("input") || opt;
    const lbl = getChoiceOptionLabel(inputEl || opt).trim().toLowerCase();
    let val = (inputEl?.value || opt.value || "").trim().toLowerCase();
    if (NOISE_VALUES.has(val)) val = "";
    if (!lbl && !val) continue;

    let score = 0;
    if ((lbl && lbl === targetText) || (val && val === targetText)) {
      score = 100;
    } else if (
      (targetText === "yes" && (lbl === "yes" || val === "yes" || /^yes\b/i.test(lbl))) ||
      (targetText === "no" && (lbl === "no" || val === "no" || /^no\b/i.test(lbl)))
    ) {
      score = 90;
    } else if (DECLINE_RE.test(targetText) && DECLINE_RE.test(lbl)) {
      score = 85;
    } else if ((lbl && lbl.startsWith(targetText)) || (val && val.startsWith(targetText))) {
      score = 80;
    } else if (lbl.length >= 2 && targetText.startsWith(lbl)) {
      score = 70;
    } else if (lbl.length >= 3 && (lbl.includes(targetText) || targetText.includes(lbl))) {
      score = 60;
    } else {
      const tw = targetText.split(/[\s,/()]+/).filter((w) => w.length >= 3);
      const lw = lbl.split(/[\s,/()]+/).filter((w) => w.length >= 3);
      const overlap = tw.filter((w) => lw.includes(w)).length;
      if (overlap > 0) {
        score = 40 + (overlap / Math.max(tw.length, lw.length)) * 20;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = inputEl;
    }
  }

  return best ? { input: best, score: bestScore } : null;
}

/**
 * Click an option the way a user would. A <button> with no `type` defaults to
 * submit, so option buttons get neutralised for the duration of the click —
 * autofilling a form must never submit the application.
 */
function safeClick(el) {
  const implicitSubmit = el.tagName === "BUTTON" && !el.hasAttribute("type") && !!el.form;
  if (implicitSubmit) el.setAttribute("type", "button");
  try {
    el.focus?.();
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      const Ctor =
        type.startsWith("pointer") && typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
      el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true }));
    }
    el.click();
  } finally {
    if (implicitSubmit) el.removeAttribute("type");
  }
}

/**
 * Check one option. Clicks the visible label (the real input is usually
 * opacity:0), then verifies — React sometimes ignores a synthetic label click,
 * in which case the native `checked` setter still lets onChange observe it.
 * @returns {boolean} whether the option ended up selected
 */
function selectChoiceOption(input) {
  if (!input) return false;
  const isNative = input.tagName === "INPUT";
  if (isNative && input.checked) return true;

  const labelEl =
    (input.id ? document.querySelector(`label[for="${escapeCssAttr(input.id)}"]`) : null) ||
    input.closest?.("label, button") ||
    null;

  safeClick(labelEl || input);

  if (!isNative) return true; // ARIA widget — no `checked` to verify against
  if (input.checked) return true;

  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "checked")?.set;
  if (setter) setter.call(input, true);
  else input.checked = true;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));

  return input.checked;
}

function fillChoiceGroup(el, text) {
  if (!el || !text) return false;

  const options = getChoiceGroupInputs(el);
  const isCheckboxGroup = options.some(
    (o) => (o.type || "").toLowerCase() === "checkbox" || o.getAttribute?.("role") === "checkbox"
  );

  const whole = matchChoiceOption(options, text);

  // "Select all that apply" answers arrive as one string. Only split it when the
  // whole string isn't itself an option — some options legitimately contain a
  // comma ("Black or African American, not Hispanic").
  const wanted =
    isCheckboxGroup && (!whole || whole.score < 80) ? splitMultiAnswer(text) : [text];

  let selected = 0;
  for (const want of wanted) {
    const match = want === text ? whole : matchChoiceOption(options, want);
    if (match && match.score > 0 && selectChoiceOption(match.input)) selected++;
  }

  return selected > 0;
}

async function fillReactSelect(controlEl, text) {
  if (!controlEl) return false;
  controlEl.scrollIntoView({ behavior: "smooth", block: "center" });

  const clickTarget =
    controlEl.querySelector(".select__value-container, .select__control, [class*='value-container'], [class*='control']") ||
    controlEl;

  clickTarget.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  clickTarget.click();
  await new Promise((r) => setTimeout(r, 150));

  // Only ever type into an input inside this control — a page-wide fallback
  // lands on whatever input comes first in the document (usually the name box).
  const searchInput = controlEl.querySelector("input");
  if (searchInput) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(searchInput, text); else searchInput.value = text;
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
  }

  const options = Array.from(
    document.querySelectorAll(".select__option, [class*='option'], [role='option']")
  ).filter((el) => isVisible(el));

  const target = text.trim().toLowerCase();
  let best = null;
  let bestScore = -1;

  for (const opt of options) {
    const txt = (opt.innerText || opt.textContent || "").trim().toLowerCase();
    let score = 0;
    if (txt === target) score = 10;
    else if (txt.startsWith(target) || target.startsWith(txt)) score = 8;
    else if (txt.includes(target) || target.includes(txt)) score = 5;

    if (score > bestScore) {
      bestScore = score;
      best = opt;
    }
  }

  if (best && bestScore > 0) {
    best.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    best.click();
    await new Promise((r) => setTimeout(r, 100));
    return true;
  }

  return false;
}

const SITE_ADAPTERS = {
  ashby: {
    name: "Ashby",
    containers: [
      "[class*='ashby']",
      "[class*='_application']",
      "[class*='_questionnaire']",
      "[class*='_field_']",
      "[class*='field']",
    ],
    async fillField(el, text) {
      if (!el || !text) return false;

      // 0. A plain text box is answered by typing into IT — never by searching
      //    its surroundings. Ashby's CSS-module wrappers (`_container_`,
      //    `_fieldEntry_`) sit several levels above the input and often span
      //    several questions, so the container-based branches below would grab
      //    the block's *first* input and drop every answer into the Name field.
      const insideSelectWidget = !!el.closest?.('[class*="_select_"], [class*="select__control"]');
      if (isTextEntryControl(el) && !insideSelectWidget) return fillDefault(el, text);
      if (el.tagName === "SELECT") return fillNativeSelect(el, text);

      // 1. Ashby Radio / Checkbox / YesNo option containers
      const container =
        el.closest?.('[data-field-path], [data-field-entry-id], [class*="_fieldEntry_"], [class*="ashby-application-form-field-entry"], [class*="_yesno_"]') ||
        el.parentElement;

      if (container) {
        const inputs = Array.from(
          container.querySelectorAll('input[type="radio"], input[type="checkbox"]')
        );

        // Ashby's yes/no widget carries a single unlabelled checkbox whose only
        // options are the buttons beside it, so fall through when this misses.
        if (inputs.length >= 1 && fillChoiceGroup(inputs[0], text)) {
          return true;
        }

        const optionButtons = Array.from(
          container.querySelectorAll('button, [class*="_option_"], [role="button"], label')
        ).filter((b) => isVisible(b));

        if (optionButtons.length >= 1) {
          const targetText = text.trim().toLowerCase();
          let bestBtn = null;
          let bestScore = -1;

          for (const btn of optionButtons) {
            const btnText = (btn.innerText || btn.textContent || "").trim().toLowerCase();
            let score = 0;

            if (btnText === targetText) {
              score = 100;
            } else if (
              (targetText === "yes" && (btnText === "yes" || /^yes\b/i.test(btnText))) ||
              (targetText === "no" && (btnText === "no" || /^no\b/i.test(btnText)))
            ) {
              score = 90;
            } else if (btnText.includes(targetText) || targetText.includes(btnText)) {
              score = 70;
            } else {
              const tw = targetText.split(/[\s,/()]+/).filter((w) => w.length >= 3);
              const bw = btnText.split(/[\s,/()]+/).filter((w) => w.length >= 3);
              const overlap = tw.filter((w) => bw.includes(w)).length;
              if (overlap > 0) {
                score = 50 + (overlap / Math.max(tw.length, bw.length)) * 20;
              }
            }

            if (score > bestScore) {
              bestScore = score;
              bestBtn = btn;
            }
          }

          if (bestBtn && bestScore > 0) {
            const inputInside = bestBtn.querySelector?.("input") || (bestBtn.tagName === "INPUT" ? bestBtn : null);
            const labelFor = bestBtn.getAttribute("for") || bestBtn.id;
            const targetLabel = labelFor ? document.querySelector(`label[for="${escapeCssAttr(labelFor)}"]`) || bestBtn : bestBtn;

            safeClick(targetLabel);

            if (inputInside && !inputInside.checked) {
              selectChoiceOption(inputInside);
            }
            return true;
          }
        }
      }

      // 2. React-select controls
      const reactControl =
        el.closest?.('[class*="_select_"], [class*="select__control"], [class*="_container_"]') ||
        (el.className && typeof el.className === "string" && /_select_|select__control|_container_/.test(el.className) ? el : null) ||
        el.parentElement?.querySelector?.('[class*="_select_"], [class*="select__control"]');

      if (reactControl) return fillReactSelect(reactControl, text);
      if (isComboboxEl(el)) return fillCombobox(el, text);
      return fillDefault(el, text);
    },
  },
  workday: {
    name: "Workday",
    containers: [
      "[data-automation-id^='formField']",
      "[data-automation-id='jobApplicationForm']",
      "[data-automation-id='applyFlowQuestionnairePage']",
      "[data-automation-id='questionnaire']",
      "[data-automation-id='jobReqQuestion']",
      "[data-automation-id*='customQuestion']",
      "[data-automation-id*='questionnaire']",
      "[data-automation-id*='Question']",
    ],
    async fillField(el, text) {
      const role = (el.getAttribute("role") || "").toLowerCase();
      const haspopup = el.getAttribute("aria-haspopup");
      if (el.tagName === "BUTTON" || role === "combobox" || role === "listbox" || haspopup) {
        return fillCombobox(el, text);
      }
      return fillDefault(el, text);
    },
  },
  greenhouse: {
    name: "Greenhouse",
    containers: [
      "#application_questions",
      "#custom_questions",
      "div.application--questions",
      "div.application-questions",
      "[class*='application-questions']",
      "[class*='application--questions']",
      "[class*='custom-questions']",
      "[data-qa='application-questions']",
      "[data-qa='custom-questions']",
    ],
    async fillField(el, text) {
      // A text box outside a react-select gets typed into directly; the sibling
      // lookup below would otherwise hand the answer to a neighbouring dropdown.
      if (isTextEntryControl(el) && !el.closest?.(".select__control")) {
        return fillDefault(el, text);
      }
      const reactControl =
        el.closest?.(".select__control") ||
        (el.className && /select__control/.test(el.className) ? el : null) ||
        el.parentElement?.querySelector?.(".select__control");
      if (reactControl) return fillReactSelect(reactControl, text);
      return fillDefault(el, text);
    },
  },
  generic: {
    name: "Generic",
    containers: [],
    async fillField(el, text) {
      return fillDefault(el, text);
    },
  },
};

function getActiveAdapter() {
  return SITE_ADAPTERS[detectSite()] || SITE_ADAPTERS.generic;
}

/**
 * Extract application form fields that look like essay/long-answer prompts.
 * Returns an array of { label, selector, currentValue, isContentEditable }.
 */
function extractFormFields() {
  const seen = new Set();
  const adapter = getActiveAdapter();
  console.log(`[RO] scraping with "${adapter.name}" adapter`);

  // 1. Scan trusted ATS question containers first
  const otherAdapterContainers = Object.values(SITE_ADAPTERS)
    .filter((a) => a !== adapter)
    .flatMap((a) => a.containers || []);
  const questionContainers = [
    ...(adapter.containers || []),
    ...otherAdapterContainers,
    ...SHARED_CONTAINERS,
  ];

  const roots = new Set();
  for (const sel of questionContainers) {
    try {
      document.querySelectorAll(sel).forEach((el) => roots.add(el));
    } catch {
      // ignore
    }
  }

  // 2. Heading-based fieldset containers
  const headingContainers = document.querySelectorAll(
    "fieldset, section, form > div, div[id], div[class]"
  );
  const headingPatterns = [
    /voluntary\s+self[\s-]?identification/i,
    /self[\s-]?identification\s+of\s+disability/i,
    /equal\s+employment\s+opportunity/i,
    /demographic/i,
    /application\s+questions?/i,
    /additional\s+(?:information|questions?)/i,
    /screening\s+questions?/i,
    /pre[-\s]?screening/i,
    /questionnaire/i,
    /education(?:al)?\s+(?:background|history|information)?/i,
    /academic\s+(?:background|history)?/i,
    /school\s+(?:information)?/i,
    /degree\s+(?:information)?/i,
  ];
  for (const el of headingContainers) {
    const heading = el.querySelector(
      ":scope > legend, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope legend, :scope h3, :scope h4"
    );
    if (!heading) continue;
    const text = heading.innerText || "";
    if (headingPatterns.some((re) => re.test(text))) {
      roots.add(el);
    }
  }

  // Always extract from matched containers AND full document body to prevent missing fields
  const containerFields = roots.size > 0 ? extractQuestionsFromContainers(Array.from(roots), seen) : [];
  const wideFields = extractQuestionsFromContainers([document.body], seen, { filterPii: false });
  const demoFields = extractDemographicFields(seen);

  // Combine and deduplicate fields
  const combined = [...containerFields, ...wideFields, ...demoFields];
  const uniqueFields = [];
  const finalSeen = new Set();
  const seenQuestions = new Set();

  for (const f of combined) {
    if (!f.selector || finalSeen.has(f.selector)) continue;
    // The three passes describe the same field with different selectors (id vs
    // name vs container); collapse them so each question is offered once.
    if (f.questionKey && seenQuestions.has(f.questionKey)) continue;
    finalSeen.add(f.selector);
    if (f.questionKey) seenQuestions.add(f.questionKey);
    uniqueFields.push(f);
  }

  return uniqueFields;
}

// EEOC / demographic / protected-class question labels. These are frequently
// missed because they live in their own section and use custom dropdowns
// (react-select), short labels, or radios that the generic scan filters out.
const DEMOGRAPHIC_LABEL_RE =
  /\b(race|ethnic(?:ity)?|gender|veteran|disabilit(?:y|ies)|disabled|hispanic|latin[ox]|sexual\s+orientation|pronouns?|transgender|national\s+origin|self[\s-]?identif\w*|demographic)\b|identify\s+your\s+(?:race|gender|ethnicity|sex)/i;

/**
 * Always-on sweep for EEOC / demographic questions anywhere on the page,
 * regardless of container structure or widget type. Dedupes against `seen`.
 */
function extractDemographicFields(seen) {
  const out = [];
  const radioGroups = new Set();

  const push = (el, selector, label) => {
    if (!selector || seen.has(selector)) return;
    seen.add(selector);
    out.push({
      label: label.slice(0, 300),
      selector,
      questionKey: getQuestionKey(el),
      currentValue: "",
      isSelect: el.tagName === "SELECT",
      isContentEditable: false,
      options: getFieldOptions(el, isChoiceInput(el) ? getFieldContainer(el) : null, label),
    });
  };

  // Native <select> + react-select controls
  document.querySelectorAll('select, [class*="select__control"]').forEach((el) => {
    if (!isVisible(el)) return;
    const label = getFieldLabel(el) || "";
    if (!DEMOGRAPHIC_LABEL_RE.test(label)) return;
    push(el, getUniqueSelector(el), label);
  });

  // Text inputs / comboboxes not already inside a react-select control
  document.querySelectorAll('input[type="text"], [role="combobox"], textarea').forEach((el) => {
    if (!isVisible(el)) return;
    if (el.closest('[class*="select__control"]')) return; // handled above
    const label = getFieldLabel(el) || "";
    if (!DEMOGRAPHIC_LABEL_RE.test(label)) return;
    push(el, getUniqueSelector(el), label);
  });

  // Radio / checkbox groups (one entry per group)
  document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach((el) => {
    if (!isChoiceVisible(el)) return;

    const ref = getChoiceGroupRef(el);
    if (radioGroups.has(ref.key)) return;
    radioGroups.add(ref.key);

    const label = getGroupLabel(el) || "";
    if (!DEMOGRAPHIC_LABEL_RE.test(label)) return;

    push(el, ref.selector, label);
  });

  return out;
}

// ─── Label detection ─────────────────────────────────────────────────────────

/**
 * Get the display label for a single radio / checkbox option.
 * Falls back to the option's value attribute when no DOM label is found.
 */
function getChoiceOptionLabel(input) {
  if (!input) return "";

  // 1. <label for="id">
  if (input.id) {
    const lbl = document.querySelector(`label[for="${escapeCssAttr(input.id)}"]`);
    if (lbl) {
      const clone = lbl.cloneNode(true);
      clone.querySelectorAll("input, select, textarea").forEach((c) => c.remove());
      const t = clone.innerText?.trim();
      if (t) return t;
    }
  }

  // 2. Wrapping <label>
  const wrapping = input.closest("label");
  if (wrapping) {
    const clone = wrapping.cloneNode(true);
    clone.querySelectorAll("input, select, textarea").forEach((c) => c.remove());
    const t = clone.innerText?.trim();
    if (t) return t;
  }

  // 3. aria-label or aria-labelledby
  const aria = input.getAttribute("aria-label")?.trim();
  if (aria) return aria;

  const labelledBy = input.getAttribute("aria-labelledby");
  if (labelledBy) {
    const t = document.getElementById(labelledBy)?.innerText?.trim();
    if (t) return t;
  }

  // 4. Sibling element text (span, div, p, text node directly next to input)
  let sib = input.nextElementSibling;
  while (sib) {
    if (sib.tagName !== "INPUT" && sib.tagName !== "SELECT" && sib.tagName !== "TEXTAREA") {
      const t = sib.innerText?.trim();
      if (t && t.length < 200) return t;
    }
    sib = sib.nextElementSibling;
  }

  // 5. Parent container IF parent container does NOT contain multiple radio/checkbox inputs
  const parent = input.parentElement;
  if (parent) {
    const siblingInputs = parent.querySelectorAll('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]');
    // Skip when the parent holds the option buttons themselves (Ashby yes/no),
    // or the "label" comes back as every option run together ("YesNo").
    const optionButtons = parent.querySelectorAll("button, [role='button']");
    if (siblingInputs.length <= 1 && optionButtons.length === 0) {
      const clone = parent.cloneNode(true);
      clone.querySelectorAll("input, select, textarea, svg").forEach((c) => c.remove());
      const t = clone.innerText?.trim();
      if (t && t.length < 200) return t;
    }
  }

  // 6. Value attribute as fallback
  return input.value || input.innerText || input.textContent || "";
}

// Values that are widget placeholders/states, never real question labels.
const PLACEHOLDER_VALUES = new Set([
  "select one", "select", "select...", "choose one", "choose", "please select",
  "select an option", "—", "-", "select response",
]);

// Phrasings that are dropdown/typeahead placeholders, e.g. "Start typing...".
const PLACEHOLDER_RE =
  /^(start typing|begin typing|type to search|type here|type a|search|please select|select an?\b|select one|select\b|choose an?\b|choose one|choose\b|loading|enter your|pick one)/;

function isPlaceholderText(text) {
  const t = (text || "").trim().toLowerCase().replace(/[.…*\s]+$/g, "").trim();
  if (!t) return true;
  if (PLACEHOLDER_VALUES.has(t)) return true;
  // Short placeholder-style prompts only — never reject a long real question.
  return t.length < 25 && PLACEHOLDER_RE.test(t);
}

function getFieldLabel(el) {
  // 0. Workday (highest priority): the question text lives in the field
  //    wrapper's formLabel. The element itself is often a dropdown button whose
  //    aria-label / text is just the current value ("Select One", "Yes"), so
  //    this MUST be checked before aria-label to avoid mislabelling.
  const wdWrapper = el.closest(
    "[data-automation-id^='formField'], [data-automation-id*='Question'], [data-automation-id*='question']"
  );
  if (wdWrapper) {
    const wdLabel = wdWrapper.querySelector(
      "[data-automation-id='formLabel'], [data-automation-id$='label'], legend, label"
    );
    if (wdLabel) {
      const text = wdLabel.innerText.trim();
      if (text.length > 2 && text.length < 400 && !isPlaceholderText(text)) return text;
    }
  }

  // 1. aria-label (skip if it's just a placeholder/value like "Select One")
  const aria = el.getAttribute("aria-label")?.trim();
  if (aria && aria.length > 2 && !isPlaceholderText(aria)) return aria;

  // 2. aria-labelledby
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.innerText?.trim())
      .filter(Boolean)
      .join(" ");
    if (text.length > 2 && !isPlaceholderText(text)) return text;
  }

  // 3. <label for="..."> (also check the react-select container's id)
  const forIds = [el.id, el.closest('[class*="select__control"]')?.parentElement?.id].filter(Boolean);
  for (const fid of forIds) {
    const lbl = document.querySelector(`label[for="${escapeCssAttr(fid)}"]`);
    if (lbl) {
      const text = lbl.innerText.trim();
      if (text.length > 2 && !isPlaceholderText(text)) return text;
    }
  }

  // 4. Wrapping <label>
  const wrappingLabel = el.closest("label");
  if (wrappingLabel) {
    const clone = wrappingLabel.cloneNode(true);
    clone.querySelectorAll("input,textarea,select,button").forEach((c) => c.remove());
    const text = clone.innerText.trim();
    if (text.length > 2 && !isPlaceholderText(text)) return text;
  }

  // 5. Nearby label/legend/heading — climb ancestors to find the real question.
  //    react-select wraps the input several levels deep, with the question
  //    <label> a sibling higher up, so a single closest() is not enough.
  let node = el.parentElement;
  for (let depth = 0; depth < 5 && node; depth++, node = node.parentElement) {
    const cands = node.querySelectorAll(
      "label, legend, [class*='label'], [class*='question'], h2, h3, h4"
    );
    for (const c of cands) {
      if (c === el || c.contains(el)) continue; // skip the field's own wrappers
      const text = (c.innerText || "").trim();
      if (text.length > 2 && text.length < 400 && !isPlaceholderText(text)) {
        return text;
      }
    }
  }

  // 6. Placeholder as last resort (only if it isn't itself a placeholder phrase)
  const placeholder = el.getAttribute("placeholder")?.trim();
  if (placeholder && placeholder.length > 5 && !isPlaceholderText(placeholder)) {
    return placeholder;
  }

  return null;
}

// ─── Selector generation ─────────────────────────────────────────────────────

function escapeCssAttr(str) {
  if (str == null) return "";
  return String(str).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function safeAttrSelector(attr, val) {
  if (!val) return "";
  return `[${attr}="${escapeCssAttr(val)}"]`;
}

/** Does this selector resolve to exactly the element it was built for? */
function selectorResolvesTo(sel, el) {
  if (!sel) return false;
  try {
    return document.querySelector(sel) === el;
  } catch {
    return false;
  }
}

/**
 * Build a selector that reaches `el` from a unique wrapper selector, using the
 * element's own distinguishing attributes. Returns "" when `el` can't be
 * singled out — a selector that stops at the wrapper is worse than none, since
 * filling a wrapper writes into whichever control happens to come first inside.
 */
function scopedSelector(baseSel, el) {
  const tag = el.tagName.toLowerCase();
  const attrs = ["name", "type", "placeholder", "aria-label", "data-testid"];
  for (const attr of attrs) {
    const val = el.getAttribute?.(attr);
    if (!val) continue;
    const sel = `${baseSel} ${tag}${safeAttrSelector(attr, val)}`;
    if (selectorResolvesTo(sel, el)) return sel;
  }
  const plain = `${baseSel} ${tag}`;
  return selectorResolvesTo(plain, el) ? plain : "";
}

function getUniqueSelector(el) {
  if (!el) return "";
  // ID is most reliable
  if (el.id) {
    const sel = safeAttrSelector("id", el.id);
    if (document.querySelectorAll(sel).length === 1) return sel;
  }

  // Ashby data-field-path / data-field-entry-id. These live on the *wrapper*
  // div, not on the control, so only use them bare when the element itself
  // carries one — otherwise descend from the wrapper to this control.
  for (const attr of ["data-field-path", "data-field-entry-id"]) {
    const own = el.getAttribute?.(attr);
    if (own) {
      const sel = safeAttrSelector(attr, own);
      if (selectorResolvesTo(sel, el)) return sel;
    }
    const holder = el.closest?.(`[${attr}]`);
    const val = holder && holder !== el ? holder.getAttribute(attr) : null;
    if (val) {
      const base = safeAttrSelector(attr, val);
      if (document.querySelectorAll(base).length === 1) {
        const scoped = scopedSelector(base, el);
        if (scoped) return scoped;
      }
    }
  }

  // name attribute
  const name = el.getAttribute("name");
  if (name) {
    const sel = `${el.tagName.toLowerCase()}${safeAttrSelector("name", name)}`;
    if (document.querySelectorAll(sel).length === 1) return sel;
  }

  // data-automation-id (Workday) / data-testid / data-qa
  const automation = el.getAttribute("data-automation-id");
  if (automation) {
    const sel = safeAttrSelector("data-automation-id", automation);
    if (selectorResolvesTo(sel, el)) return sel;
  }

  const testId = el.getAttribute("data-testid") || el.getAttribute("data-qa");
  if (testId) {
    const sel = safeAttrSelector(el.hasAttribute("data-testid") ? "data-testid" : "data-qa", testId);
    if (selectorResolvesTo(sel, el)) return sel;
  }

  // Build hierarchical parent-child CSS selector path
  const path = [];
  let curr = el;

  while (curr && curr !== document.body && curr !== document.documentElement) {
    const tag = curr.tagName.toLowerCase();

    if (curr.id) {
      path.unshift(safeAttrSelector("id", curr.id));
      break;
    }

    const nameAttr = curr.getAttribute("name");
    if (nameAttr && (tag === "input" || tag === "select" || tag === "textarea")) {
      path.unshift(`${tag}${safeAttrSelector("name", nameAttr)}`);
      break;
    }

    let selector = tag;
    const meaningfulClasses = Array.from(curr.classList || [])
      .filter((c) => c.length > 2 && !/^\d/.test(c) && !/^css-/.test(c) && !/^_[a-zA-Z0-9]+_[a-zA-Z0-9]+_\d+$/.test(c))
      .slice(0, 2);

    if (meaningfulClasses.length) {
      selector += meaningfulClasses.map((c) => `.${CSS.escape(c)}`).join("");
    }

    // Compute 1-based nth-of-type index relative to parent element
    if (curr.parentElement) {
      const siblings = Array.from(curr.parentElement.children).filter(
        (child) => child.tagName === curr.tagName
      );
      if (siblings.length > 1) {
        const index = siblings.indexOf(curr) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }

    path.unshift(selector);
    curr = curr.parentElement;
  }

  const fullSel = path.join(" > ");
  if (fullSel && document.querySelectorAll(fullSel).length === 1) {
    return fullSel;
  }
  return fullSel || el.tagName.toLowerCase();
}

/**
 * Fallback DOM field search by label string, for when a stored CSS selector
 * stops resolving after an SPA re-render.
 *
 * The match must be near-exact and is resolved to the *most specific* element:
 * a loose "contains" match hits every ancestor wrapper too, and resolving one
 * of those returns whatever input happens to come first on the page — which is
 * how answers ended up in the name box and the résumé upload.
 */
function findInputByLabel(labelStr) {
  const target = normalizeLabelText(labelStr);
  if (!target || target.length < 3) return null;

  const candidates = document.querySelectorAll(
    "label, legend, h1, h2, h3, h4, p, span, div, [class*='label'], [class*='question'], [class*='title']"
  );

  let bestLabel = null;
  let bestLen = Infinity;
  for (const node of candidates) {
    const txt = normalizeLabelText(node.innerText || node.textContent);
    if (!txt) continue;
    // Allow a little trailing chrome ("… *", "(required)") but nothing more.
    if (txt !== target && !(txt.startsWith(target) && txt.length <= target.length + 40)) continue;
    if (txt.length < bestLen) {
      bestLen = txt.length;
      bestLabel = node;
    }
  }
  if (!bestLabel) return null;

  const forAttr = bestLabel.getAttribute?.("for");
  if (forAttr) {
    const direct = document.getElementById(forAttr);
    if (direct && isFillTarget(direct)) return direct;
  }

  const container = getFieldContainer(bestLabel) || bestLabel.parentElement;
  if (!container || !isVisible(container)) return null;

  const choice = Array.from(container.querySelectorAll(CHOICE_SEL)).find((c) => isChoiceVisible(c));
  if (choice) return choice;

  const input = Array.from(
    container.querySelectorAll(
      'textarea, select, input:not([type="hidden"]):not([type="file"]), [role="combobox"], [role="textbox"], [class*="_select_"], [class*="select__control"]'
    )
  ).find((c) => isVisible(c));
  if (input) return input;

  // Styled button groups (Ashby yes/no) have no reachable input — hand the
  // adapter the container and let it find the option buttons.
  return container;
}

/**
 * Visible file inputs that likely accept a résumé/CV (for auto-attach).
 */
function extractResumeFileInputs() {
  const inputs = document.querySelectorAll('input[type="file"]');
  const out = [];

  for (const input of inputs) {
    if (!isVisible(input)) continue;

    const label = (getFieldLabel(input) || "").trim();
    const name = (input.getAttribute("name") || "").toLowerCase();
    const id = (input.id || "").toLowerCase();
    const accept = (input.accept || "").toLowerCase();
    const aria = (input.getAttribute("aria-label") || "").toLowerCase();
    const hay = `${label} ${name} ${id} ${aria}`.toLowerCase();

    const resumeWord = /resume|résumé|resumé|curriculum|vitae|\bcv\b/.test(hay);
    const attachCue = /upload|attach|file|document/.test(hay);
    const acceptDoc = !accept || /\.pdf|pdf|doc|docx|word|rtf/.test(accept);

    if (!acceptDoc) continue;
    if (!resumeWord && !(attachCue && /pdf|doc/.test(accept))) continue;

    const selector = getUniqueSelector(input);
    out.push({
      selector,
      label: label.slice(0, 200) || "(resume upload)",
      accept: input.accept || "",
    });
  }

  return out;
}

/**
 * Programmatically set a PDF file on a file input (ATS upload fields).
 */
function attachResumePdf(selector, base64Pdf, filename) {
  if (!selector || !base64Pdf) {
    return { ok: false, error: "Missing selector or file data." };
  }

  let input = null;
  try {
    input = document.querySelector(selector);
  } catch {
    return { ok: false, error: "Invalid selector." };
  }

  if (!input || input.tagName !== "INPUT" || input.type !== "file") {
    return { ok: false, error: "No file input found for that selector." };
  }
  if (!isVisible(input)) {
    return { ok: false, error: "That file input is not visible." };
  }

  let bytes;
  try {
    const bin = atob(base64Pdf);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch {
    return { ok: false, error: "Invalid PDF data." };
  }

  const name = (filename && String(filename).trim()) || "resume-tailored.pdf";
  const file = new File([bytes], name, { type: "application/pdf" });
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;

  input.focus();
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));

  return { ok: true };
}

// ─── Autofill ─────────────────────────────────────────────────────────────────

/**
 * answers: Array<{ selector: string, text: string }>
 * Routes each field through the active site adapter's fillField strategy.
 */
async function autofill(answers) {
  let filled = 0;
  let skipped = 0;

  const adapter = getActiveAdapter();
  console.log(`[RO] autofill using "${adapter.name}" adapter for ${answers.length} field(s)`);

  for (const answer of answers) {
    if (!answer.text?.trim()) { skipped++; continue; }

    let el = null;
    try {
      el = document.querySelector(answer.selector);
    } catch {
      // malformed selector
    }

    if (!isFillTarget(el)) {
      // Fallback: resolve input element dynamically by question label
      el = findInputByLabel(answer.label);
    }

    if (!isFillTarget(el)) {
      console.warn(`[RO] skipped "${answer.label}" — element not found or hidden (selector: ${answer.selector})`);
      skipped++;
      continue;
    }

    // A selector may land on the question's wrapper rather than its control.
    el = narrowToControl(el, answer.label);
    if (!isFillTarget(el)) {
      console.warn(`[RO] skipped "${answer.label}" — wrapper holds several controls, none clearly its own`);
      skipped++;
      continue;
    }

    // Guard against a fallback landing on someone else's field: the control we
    // resolved must sit under the question we were told to answer.
    const resolvedLabel = normalizeLabelText(getGroupLabel(el) || getFieldLabel(el) || "");
    const wantedLabel = normalizeLabelText(answer.label);
    if (wantedLabel && resolvedLabel && !resolvedLabel.startsWith(wantedLabel) && !wantedLabel.startsWith(resolvedLabel)) {
      console.warn(`[RO] skipped "${answer.label}" — resolved to a different question ("${resolvedLabel}")`);
      skipped++;
      continue;
    }

    if (valueConflictsWithField(el, answer.text)) {
      console.warn(`[RO] skipped "${answer.label}" — "${answer.text.slice(0, 40)}" doesn't belong in this control`);
      skipped++;
      continue;
    }

    console.log(`[RO] [${adapter.name}] filling "${answer.label}" → <${el.tagName} type="${el.type || ""}" role="${el.getAttribute("role") || ""}">`);

    try {
      const ok = await adapter.fillField(el, answer.text);
      if (ok) filled++; else skipped++;
    } catch (e) {
      console.warn("[Resume Optimizer] Autofill failed for", answer.selector, e);
      skipped++;
    }
  }

  return { filled, skipped };
}

/**
 * A stored selector can resolve to the question's wrapper instead of its
 * control (Ashby puts `data-field-path` on a div). Filling a wrapper writes
 * into whatever input comes first inside it, which is how a LinkedIn URL ends
 * up in the name box, so resolve to the control that belongs to THIS question.
 *
 * Returns the container unchanged when it holds no control at all — styled
 * option-button groups have none, and the adapter clicks the buttons itself.
 */
function narrowToControl(el, label) {
  if (!el || isControlEl(el)) return el;

  const controls = Array.from(
    el.querySelectorAll(
      'textarea, select, input:not([type="hidden"]):not([type="file"]), [contenteditable="true"], [contenteditable=""], [role="combobox"], [role="textbox"]'
    )
  ).filter((c) => isFillTarget(c));

  if (!controls.length) return el;
  if (controls.length === 1) return controls[0];

  const byLabel = findInputByLabel(label);
  return byLabel && el.contains(byLabel) ? byLabel : null;
}

// Person-name fields, as opposed to fields that merely contain the word "name"
// (username, file name, company name, school name…).
const PERSON_NAME_RE =
  /\b(first|last|full|legal|preferred|middle|given|family|sur)?\s*name\b/;
const NON_PERSON_NAME_RE = /(user|file|company|employer|school|university|domain|url|link|host)/;

/**
 * Last-resort sanity check: refuse to write a value whose shape contradicts the
 * control it is about to land in. Cheap insurance against any remaining
 * label/selector mix-up putting a URL or an email address in the name box.
 */
function valueConflictsWithField(el, text) {
  const t = (text || "").trim();
  if (!t) return false;

  const type = (el.type || "").toLowerCase();
  const hay = [
    el.getAttribute?.("name"),
    el.id,
    el.getAttribute?.("autocomplete"),
    el.getAttribute?.("placeholder"),
    el.getAttribute?.("aria-label"),
    getFieldLabel(el),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const isUrl = /^(https?:\/\/|www\.)/.test(t) || /\b[a-z0-9-]+\.(com|io|dev|net|org)\//.test(t);
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  const isPersonName = PERSON_NAME_RE.test(hay) && !NON_PERSON_NAME_RE.test(hay);

  if (isPersonName && (isUrl || isEmail)) return true;
  // Only a dedicated email box — a long question that merely mentions email
  // ("How did you hear…") can legitimately take free text.
  const emailBox = type === "email" || (/\be-?mail\b/.test(hay) && hay.length <= 60);
  if (emailBox && !isEmail) return true;
  if (type === "url" && !isUrl) return true;
  return false;
}

// ─── Inline AI generate button for essay fields ──────────────────────────────

const RO_BTN_CLASS = "ro-ai-gen-btn";
let roEssayButtons = []; // { btn, el }
let roScrollListenerAdded = false;

const SPARKLE_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/>
  <path d="M5 17l.75 2.25L8 20l-2.25.75L5 23l-.75-2.25L2 20l2.25-.75L5 17z"/>
  <path d="M19 3l.5 1.5L21 5l-1.5.5L19 7l-.5-1.5L17 5l1.5-.5L19 3z"/>
</svg>`;

const SPINNER_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
  <path d="M12 2a10 10 0 0 1 10 10" style="animation:ro-spin 0.7s linear infinite;transform-origin:center"/>
</svg>`;

function injectEssayButtonStyles() {
  if (document.getElementById("ro-ai-btn-styles")) return;
  const s = document.createElement("style");
  s.id = "ro-ai-btn-styles";
  s.textContent = `
    .${RO_BTN_CLASS} {
      position: fixed !important;
      z-index: 2147483645 !important;
      width: 26px !important;
      height: 26px !important;
      border-radius: 7px !important;
      background: #7c3aed !important;
      color: #fff !important;
      border: none !important;
      cursor: pointer !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0 !important;
      margin: 0 !important;
      box-shadow: 0 2px 8px rgba(0,0,0,0.28) !important;
      opacity: 0.72 !important;
      transition: opacity 0.15s, transform 0.12s !important;
      pointer-events: auto !important;
      line-height: 1 !important;
    }
    .${RO_BTN_CLASS}:hover { opacity: 1 !important; transform: scale(1.1) !important; }
    .${RO_BTN_CLASS}:disabled { cursor: wait !important; opacity: 1 !important; }
    .${RO_BTN_CLASS} svg { width: 13px !important; height: 13px !important; pointer-events: none !important; }
    @keyframes ro-spin { to { transform: rotate(360deg); } }
    .${RO_BTN_CLASS}:disabled svg { animation: ro-spin 0.75s linear infinite !important; }

    .ro-ai-loading {
      position: fixed !important;
      z-index: 2147483646 !important;
      display: flex !important;
      align-items: center !important;
      gap: 6px !important;
      padding: 5px 10px !important;
      background: #7c3aed !important;
      color: #fff !important;
      border-radius: 999px !important;
      font: 600 11px/1.2 system-ui, -apple-system, "Segoe UI", sans-serif !important;
      box-shadow: 0 2px 10px rgba(124,58,237,0.4) !important;
      pointer-events: none !important;
      white-space: nowrap !important;
    }
    .ro-ai-loading svg { width: 13px !important; height: 13px !important; animation: ro-spin 0.75s linear infinite !important; }

    .ro-ai-menu {
      position: fixed !important;
      z-index: 2147483646 !important;
      width: 280px !important;
      background: #fff !important;
      color: #18181b !important;
      border: 1px solid #e4e4e7 !important;
      border-radius: 10px !important;
      box-shadow: 0 8px 28px rgba(0,0,0,0.20) !important;
      padding: 6px !important;
      font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif !important;
      box-sizing: border-box !important;
    }
    .ro-ai-menu * { box-sizing: border-box !important; }
    .ro-ai-menu-item {
      display: flex !important;
      align-items: center !important;
      gap: 8px !important;
      width: 100% !important;
      text-align: left !important;
      padding: 8px 10px !important;
      border: none !important;
      background: transparent !important;
      color: #18181b !important;
      border-radius: 7px !important;
      cursor: pointer !important;
      font: inherit !important;
      font-weight: 500 !important;
    }
    .ro-ai-menu-item:hover { background: #f4f4f5 !important; }
    .ro-ai-menu-item svg { width: 15px !important; height: 15px !important; color: #7c3aed !important; flex: 0 0 auto !important; }
    .ro-ai-menu-item-sub { display: block !important; font-size: 11px !important; font-weight: 400 !important; color: #71717a !important; margin-top: 1px !important; }
    .ro-ai-menu-custom { padding: 6px !important; }
    .ro-ai-menu-custom textarea {
      width: 100% !important;
      min-height: 64px !important;
      resize: vertical !important;
      padding: 7px 9px !important;
      border: 1px solid #e4e4e7 !important;
      border-radius: 7px !important;
      font: inherit !important;
      color: #18181b !important;
      background: #fff !important;
      outline: none !important;
    }
    .ro-ai-menu-custom textarea:focus { border-color: #7c3aed !important; }
    .ro-ai-menu-custom .ro-ai-menu-row { display: flex !important; gap: 6px !important; margin-top: 6px !important; }
    .ro-ai-menu-submit {
      flex: 1 !important;
      padding: 7px 10px !important;
      border: none !important;
      border-radius: 7px !important;
      background: #7c3aed !important;
      color: #fff !important;
      font: inherit !important;
      font-weight: 600 !important;
      cursor: pointer !important;
    }
    .ro-ai-menu-submit:disabled { opacity: 0.6 !important; cursor: wait !important; }
    .ro-ai-menu-back {
      padding: 7px 10px !important;
      border: 1px solid #e4e4e7 !important;
      border-radius: 7px !important;
      background: #fff !important;
      color: #52525b !important;
      font: inherit !important;
      cursor: pointer !important;
    }
    @media (prefers-color-scheme: dark) {
      .ro-ai-menu { background: #18181b !important; color: #fafafa !important; border-color: #3f3f46 !important; }
      .ro-ai-menu-item { color: #fafafa !important; }
      .ro-ai-menu-item:hover { background: #27272a !important; }
      .ro-ai-menu-custom textarea { background: #27272a !important; color: #fafafa !important; border-color: #3f3f46 !important; }
      .ro-ai-menu-back { background: #27272a !important; color: #d4d4d8 !important; border-color: #3f3f46 !important; }
    }
  `;
  document.documentElement.appendChild(s);
}

function removeEssayButtons() {
  closeFieldMenu();
  for (const { btn } of roEssayButtons) btn.remove();
  roEssayButtons = [];
}

function isEssayField(el) {
  return (
    el.tagName === "TEXTAREA" ||
    el.getAttribute("contenteditable") === "true" ||
    el.getAttribute("contenteditable") === ""
  );
}

function positionEssayButton(btn, el) {
  const rect = el.getBoundingClientRect();
  // Hide if off-screen or too small
  if (rect.width < 30 || rect.height < 30 ||
      rect.bottom < 0 || rect.top > window.innerHeight ||
      rect.right < 0 || rect.left > window.innerWidth) {
    btn.style.display = "none !important";
    return;
  }
  btn.style.cssText += `
    display: flex !important;
    top: ${Math.round(rect.bottom - 32)}px !important;
    left: ${Math.round(rect.right - 32)}px !important;
  `;
}

function injectEssayButtons(fields) {
  // Don't tear down/rebuild buttons while the generate menu is open — the
  // page's mutation-driven re-scrape would otherwise close it mid-interaction.
  if (roOpenMenu) return;
  removeEssayButtons();
  injectEssayButtonStyles();

  for (const field of fields) {
    let el;
    try { el = document.querySelector(field.selector); } catch { continue; }
    if (!el || !isEssayField(el) || !isVisible(el)) continue;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = RO_BTN_CLASS;
    btn.title = "Generate AI answer";
    btn.setAttribute("aria-label", "Generate AI answer");
    btn.innerHTML = SPARKLE_SVG;
    btn.title = "Generate AI answer";
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      openFieldMenu(field, el, btn);
    });

    document.documentElement.appendChild(btn);
    positionEssayButton(btn, el);
    roEssayButtons.push({ btn, el });
  }

  // One shared scroll/resize listener to keep buttons aligned
  if (!roScrollListenerAdded) {
    roScrollListenerAdded = true;
    const reposition = () => {
      for (let i = roEssayButtons.length - 1; i >= 0; i--) {
        const { btn, el } = roEssayButtons[i];
        if (!document.contains(el)) {
          btn.remove();
          roEssayButtons.splice(i, 1);
        } else {
          positionEssayButton(btn, el);
        }
      }
    };
    window.addEventListener("scroll", reposition, { passive: true, capture: true });
    window.addEventListener("resize", reposition, { passive: true });
  }
}

// ── AI generate menu (Generate / Generate with instructions) ──

let roOpenMenu = null;
let roOpenMenuBtn = null;

function repositionOpenMenu() {
  if (roOpenMenu && roOpenMenuBtn) positionMenu(roOpenMenu, roOpenMenuBtn);
}

function closeFieldMenu() {
  if (roOpenMenu) {
    roOpenMenu.remove();
    roOpenMenu = null;
    roOpenMenuBtn = null;
    document.removeEventListener("mousedown", onMenuOutsideClick, true);
    window.removeEventListener("scroll", repositionOpenMenu, true);
    window.removeEventListener("resize", repositionOpenMenu);
  }
}

function onMenuOutsideClick(e) {
  // Ignore clicks on a sparkle button — its own handler toggles the menu.
  if (e.target.closest?.(`.${RO_BTN_CLASS}`)) return;
  if (roOpenMenu && !roOpenMenu.contains(e.target)) closeFieldMenu();
}

function positionMenu(menu, btn) {
  const r = btn.getBoundingClientRect();
  const w = 280, gap = 6;
  let left = r.right - w;
  if (left < 8) left = 8;
  let top = r.bottom + gap;
  // Flip above if it would overflow the viewport bottom
  if (top + menu.offsetHeight > window.innerHeight - 8) {
    top = Math.max(8, r.top - menu.offsetHeight - gap);
  }
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(top)}px`;
}

function openFieldMenu(field, el, btn) {
  if (roOpenMenu) { closeFieldMenu(); return; }
  injectEssayButtonStyles();

  const menu = document.createElement("div");
  menu.className = "ro-ai-menu";

  const sparkle = SPARKLE_SVG;
  menu.innerHTML = `
    <button type="button" class="ro-ai-menu-item" data-act="generate">
      ${sparkle}
      <span>Generate
        <span class="ro-ai-menu-item-sub">From your profile + this job</span>
      </span>
    </button>
    <button type="button" class="ro-ai-menu-item" data-act="custom">
      ${sparkle}
      <span>Generate with instructions
        <span class="ro-ai-menu-item-sub">Tell it which experience / angle to use</span>
      </span>
    </button>
    <div class="ro-ai-menu-custom" style="display:none">
      <textarea placeholder="e.g. Use my Web Lead role and focus on how I led the team and shipped the project."></textarea>
      <div class="ro-ai-menu-row">
        <button type="button" class="ro-ai-menu-back" data-act="back">Back</button>
        <button type="button" class="ro-ai-menu-submit" data-act="submit">Generate</button>
      </div>
    </div>`;

  document.documentElement.appendChild(menu);
  roOpenMenu = menu;
  roOpenMenuBtn = btn;
  positionMenu(menu, btn);
  document.addEventListener("mousedown", onMenuOutsideClick, true);
  window.addEventListener("scroll", repositionOpenMenu, true);
  window.addEventListener("resize", repositionOpenMenu);

  const customArea = menu.querySelector(".ro-ai-menu-custom");
  const items = menu.querySelectorAll(".ro-ai-menu-item");

  menu.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act;
    if (!act) return;
    if (act === "generate") {
      closeFieldMenu();
      runFieldGenerate(field, el, btn, "");
    } else if (act === "custom") {
      items.forEach((i) => (i.style.display = "none"));
      customArea.style.display = "block";
      positionMenu(menu, btn);
      customArea.querySelector("textarea").focus();
    } else if (act === "back") {
      customArea.style.display = "none";
      items.forEach((i) => (i.style.display = ""));
      positionMenu(menu, btn);
    } else if (act === "submit") {
      const instructions = customArea.querySelector("textarea").value.trim();
      closeFieldMenu();
      runFieldGenerate(field, el, btn, instructions);
    }
  });
}

/**
 * Detect a character/word limit for a field from: the maxlength attribute, a
 * nearby "X / 500" or "500 characters" counter, or a limit stated in the question.
 */
function getFieldLimit(el, questionLabel) {
  let maxChars = 0;
  let maxWords = 0;

  // 1. maxlength attribute (most reliable)
  const ml = parseInt(el.getAttribute("maxlength") ?? "", 10);
  if (Number.isFinite(ml) && ml > 0) maxChars = ml;

  // 2. Nearby counter / helper text (climb a few ancestors)
  let counterText = "";
  let node = el.parentElement;
  for (let i = 0; i < 3 && node; i++, node = node.parentElement) {
    counterText += " " + (node.innerText || "");
  }
  const fromCounter =
    counterText.match(/(?:max(?:imum)?|limit(?:ed)?(?:\s*to)?)\s*(?:of\s*)?(\d{2,5})\s*(?:characters?|chars?)/i)?.[1] ||
    counterText.match(/(\d{2,5})\s*(?:characters?|chars?)\s*(?:max|maximum|limit|allowed|remaining|left)/i)?.[1] ||
    (/(?:character|char)/i.test(counterText) ? counterText.match(/\/\s*(\d{2,5})\b/)?.[1] : null);
  if (fromCounter) {
    const n = parseInt(fromCounter, 10);
    if (n > 0 && (!maxChars || n < maxChars)) maxChars = n;
  }

  // 3. Limit stated in the question text itself
  const q = questionLabel || "";
  const qWords = q.match(/(\d{2,5})\s*words?\b/i)?.[1];
  if (qWords) maxWords = parseInt(qWords, 10);
  const qChars = q.match(/(\d{2,5})\s*characters?\b/i)?.[1];
  if (qChars) {
    const n = parseInt(qChars, 10);
    if (n > 0 && (!maxChars || n < maxChars)) maxChars = n;
  }

  return { maxChars: maxChars || 0, maxWords: maxWords || 0 };
}

/** Trim text to a hard char limit at a sentence/word boundary as a safety net. */
function enforceCharLimit(text, maxChars) {
  if (!maxChars || text.length <= maxChars) return text;
  let t = text.slice(0, maxChars);
  const lastStop = Math.max(t.lastIndexOf(". "), t.lastIndexOf("! "), t.lastIndexOf("? "));
  if (lastStop > maxChars * 0.6) {
    t = t.slice(0, lastStop + 1);
  } else {
    const lastSpace = t.lastIndexOf(" ");
    if (lastSpace > maxChars * 0.5) t = t.slice(0, lastSpace);
  }
  return t.trim();
}

/** Floating "Generating…" pill anchored to a field; returns a remover. */
function showFieldLoadingPill(el) {
  injectEssayButtonStyles();
  const pill = document.createElement("div");
  pill.className = "ro-ai-loading";
  pill.innerHTML = `${SPINNER_SVG}<span>Generating…</span>`;
  document.documentElement.appendChild(pill);

  const place = () => {
    const r = el.getBoundingClientRect();
    pill.style.top = `${Math.round(r.top + 8)}px`;
    pill.style.left = `${Math.round(Math.max(8, r.right - pill.offsetWidth - 8))}px`;
  };
  place();
  const onMove = () => place();
  window.addEventListener("scroll", onMove, true);
  window.addEventListener("resize", onMove);

  return () => {
    pill.remove();
    window.removeEventListener("scroll", onMove, true);
    window.removeEventListener("resize", onMove);
  };
}

async function runFieldGenerate(field, el, btn, customInstructions) {
  if (btn.disabled) return;
  btn.disabled = true;
  const prevHtml = btn.innerHTML;
  btn.innerHTML = SPINNER_SVG;
  const removeLoading = showFieldLoadingPill(el);

  const limit = getFieldLimit(el, field.label);
  if (limit.maxChars || limit.maxWords) {
    console.log(`[RO] field limit:`, limit);
  }

  try {
    const response = await new Promise((resolve) => {
      try {
        if (!chrome?.runtime?.id) { resolve({ error: "Extension reloaded — refresh the page." }); return; }
        chrome.runtime.sendMessage(
          {
            type: "GENERATE_FIELD_ANSWER",
            payload: {
              question: field.label,
              jd: cachedScrape?.jd || "",
              customInstructions: customInstructions || "",
              maxChars: limit.maxChars,
              maxWords: limit.maxWords,
            },
          },
          (res) => {
            if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
            else resolve(res);
          }
        );
      } catch (e) {
        resolve({ error: String(e?.message || e) });
      }
    });

    if (response?.error) {
      showFieldBtnTooltip(btn, response.error, true);
      return;
    }

    let answer = (response?.optimizedAnswer || "").trim();
    if (!answer) { showFieldBtnTooltip(btn, "No answer returned.", true); return; }

    // Safety net: hard-trim to the form's char limit if the model overshot.
    if (limit.maxChars) answer = enforceCharLimit(answer, limit.maxChars);

    // Inject the answer into the field (same logic as autofill)
    if (el.getAttribute("contenteditable") === "true" || el.getAttribute("contenteditable") === "") {
      el.focus();
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, answer);
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
    } else {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (setter) setter.call(el, answer); else el.value = answer;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const within = limit.maxChars ? ` (${answer.length}/${limit.maxChars})` : "";
    showFieldBtnTooltip(btn, `Done ✓${within}`, false);
  } catch (e) {
    showFieldBtnTooltip(btn, "Failed.", true);
    console.warn("[Resume Optimizer] Field AI generate failed:", e);
  } finally {
    removeLoading();
    btn.innerHTML = prevHtml;
    btn.disabled = false;
  }
}

/** Show a brief tooltip above the button then auto-hide after 2s. */
function showFieldBtnTooltip(btn, msg, isError) {
  const tip = document.createElement("div");
  tip.style.cssText = `
    position: fixed !important;
    z-index: 2147483646 !important;
    background: ${isError ? "#dc2626" : "#16a34a"} !important;
    color: #fff !important;
    font: 600 11px/1.4 system-ui, sans-serif !important;
    padding: 4px 8px !important;
    border-radius: 5px !important;
    white-space: nowrap !important;
    pointer-events: none !important;
    box-shadow: 0 2px 6px rgba(0,0,0,0.25) !important;
  `;
  tip.textContent = msg;
  document.documentElement.appendChild(tip);

  const rect = btn.getBoundingClientRect();
  tip.style.left = `${Math.round(rect.left + rect.width / 2 - tip.offsetWidth / 2)}px`;
  tip.style.top = `${Math.round(rect.top - tip.offsetHeight - 6)}px`;
  setTimeout(() => tip.remove(), 2000);
}

// ─── Combobox / live-search autofill ─────────────────────────────────────────

function isComboboxEl(el) {
  const role = (el.getAttribute("role") || "").toLowerCase();
  return (
    role === "combobox" ||
    role === "listbox" ||
    el.getAttribute("aria-autocomplete") != null ||
    (el.getAttribute("aria-haspopup") != null &&
      el.getAttribute("aria-haspopup") !== "false" &&
      el.getAttribute("aria-haspopup") !== "")
  );
}

/**
 * Score a candidate dropdown option element against the target text.
 * Returns a number > 0 when it's a plausible match.
 */
function scoreDropdownOption(el, target) {
  const text = (el.textContent || el.innerText || "").trim().toLowerCase();
  if (!text || text.length < 2) return 0;
  if (text === target) return 5;
  if (text.startsWith(target)) return 4;
  if (target.startsWith(text) && text.length >= 4) return 3;
  if (text.includes(target)) return 2;
  if (target.includes(text) && text.length >= 4) return 1;
  // Word-level overlap as a fractional score
  const tw = target.split(/\s+/).filter((w) => w.length >= 3);
  if (tw.length === 0) return 0;
  const ew = text.split(/\s+/);
  const hits = tw.filter((w) => ew.some((e) => e.includes(w) || w.includes(e))).length;
  return hits > 0 ? (hits / Math.max(tw.length, ew.length)) * 0.8 : 0;
}

/**
 * Search for rendered dropdown option elements near the given anchor element.
 * Looks in ancestor containers first, then falls back to the whole document
 * (React portals mount dropdowns directly on <body>).
 */
function findRenderedDropdownOptions(anchorEl) {
  const OPTION_SEL = [
    '[role="option"]',
    '[role="listbox"] li',
    'ul[role="listbox"] > *',
    '.dropdown-item:not([disabled])',
    '[class*="suggestion"]:not([disabled])',
    '[class*="autocomplete-option"]',
    '[class*="combobox-option"]',
    '[class*="select-option"]',
    '[class*="typeahead"] li',
    '[data-testid*="option"]',
    '[data-qa*="option"]',
  ].join(", ");

  // Walk up to 7 ancestor containers
  let container = anchorEl.parentElement;
  for (let i = 0; i < 7 && container && container !== document.body; i++) {
    const found = container.querySelectorAll(OPTION_SEL);
    if (found.length > 0) return Array.from(found);
    container = container.parentElement;
  }

  // Portal fallback — dropdown mounted on body
  return Array.from(document.querySelectorAll(OPTION_SEL));
}

/**
 * Simulate typing into a combobox, wait for the dropdown to populate, then
 * click the best-matching option. Returns true if an option was clicked.
 */
async function fillCombobox(el, text) {
  const target = text.trim().toLowerCase();

  // Focus and inject the search string to trigger the ATS autocomplete handler
  el.focus();
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (nativeSetter) nativeSetter.call(el, text); else el.value = text;

  el.dispatchEvent(new Event("focus", { bubbles: true }));
  el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  // Some ATS listen for keydown to open the dropdown
  el.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: text.slice(-1), keyCode: text.charCodeAt(text.length - 1) }));
  el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: text.slice(-1) }));

  // Poll for rendered options (80 ms interval, 1600 ms total timeout)
  const POLL_MS = 80;
  const TIMEOUT_MS = 1600;
  const deadline = Date.now() + TIMEOUT_MS;
  let bestOption = null;
  let bestScore = 0;

  while (Date.now() < deadline) {
    const candidates = findRenderedDropdownOptions(el);
    if (candidates.length > 0) {
      for (const opt of candidates) {
        const s = scoreDropdownOption(opt, target);
        if (s > bestScore) { bestScore = s; bestOption = opt; }
      }
      // Stop early if we have a high-confidence match
      if (bestScore >= 2) break;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  if (!bestOption || bestScore === 0) return false;

  // Click the option to commit the selection
  bestOption.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  bestOption.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
  bestOption.click();
  bestOption.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));

  // Brief settle so the ATS can update its state before the next field
  await new Promise((r) => setTimeout(r, 120));
  return true;
}

// ─── Work Experience auto-fill (Workday + generic) ───────────────────────────

const MONTHS = [
  "january","february","march","april","may","june",
  "july","august","september","october","november","december",
];

/** Parse a free-text date like "Jan 2025" / "2023-05" / "May 2027" → {month:1-12, year}. */
function parseDateParts(str) {
  const s = (str || "").trim().toLowerCase();
  if (!s) return null;
  if (/present|current|now|ongoing/.test(s)) return { present: true };

  let year = null;
  const yearMatch = s.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) year = yearMatch[0];

  let month = null;
  for (let i = 0; i < MONTHS.length; i++) {
    if (s.includes(MONTHS[i]) || s.includes(MONTHS[i].slice(0, 3))) { month = i + 1; break; }
  }
  if (month == null) {
    const mNum = s.match(/\b(0?[1-9]|1[0-2])\b[\/\-]/);
    if (mNum) month = parseInt(mNum[1], 10);
  }
  if (!year && month == null) return null;
  return { month, year };
}

function fireInput(el, value) {
  const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, value); else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Find an input/textarea inside a panel by automation-id list, then by label text. */
function findFieldInPanel(panel, automationIds, labelKeywords) {
  for (const id of automationIds) {
    const byAuto = panel.querySelector(
      `[data-automation-id="${id}"], [data-automation-id="${id}"] input, [data-automation-id="${id}"] textarea`
    );
    if (byAuto) {
      if (byAuto.tagName === "INPUT" || byAuto.tagName === "TEXTAREA") return byAuto;
      const inner = byAuto.querySelector("input, textarea");
      if (inner) return inner;
    }
  }
  // Fallback: match by nearby label text
  const all = panel.querySelectorAll("input, textarea");
  for (const el of all) {
    if (!isVisible(el)) continue;
    const label = (getFieldLabel(el) || "").toLowerCase();
    if (labelKeywords.some((kw) => label.includes(kw))) return el;
  }
  return null;
}

/** Fill a Workday-style date field (separate month/year spin inputs) within a panel. */
function fillDateField(panel, automationId, parts) {
  if (!parts || parts.present) return;
  const wrapper = panel.querySelector(`[data-automation-id="${automationId}"]`) || panel;
  const monthInput = wrapper.querySelector(
    'input[data-automation-id="dateSectionMonth-input"], input[aria-label*="Month" i], [data-automation-id="dateSectionMonth-display"]'
  );
  const yearInput = wrapper.querySelector(
    'input[data-automation-id="dateSectionYear-input"], input[aria-label*="Year" i], [data-automation-id="dateSectionYear-display"]'
  );
  if (monthInput && parts.month != null && monthInput.tagName === "INPUT") {
    fireInput(monthInput, String(parts.month).padStart(2, "0"));
  }
  if (yearInput && parts.year && yearInput.tagName === "INPUT") {
    fireInput(yearInput, String(parts.year));
  }
}

const WORK_EXP_RE = /work\s+experience|work\s+history|employment\s+history|employment\s+information|professional\s+experience|experience/i;

/** Locate the Work Experience section container on the page. */
function findWorkExperienceSection() {
  // 1. Workday-specific automation ids (cover common tenant spellings)
  const wdSel = [
    '[data-automation-id*="workExperience" i]',
    '[data-automation-id*="work-experience" i]',
    '[data-automation-id*="employmentHistory" i]',
    '[data-automation-id*="employment-history" i]',
    '[aria-label*="Work Experience" i]',
  ];
  for (const sel of wdSel) {
    try {
      const el = document.querySelector(sel);
      if (el && isVisible(el)) {
        console.log(`[RO] work-exp section via "${sel}"`);
        return el;
      }
    } catch { /* invalid selector */ }
  }

  // 2. Heading-based: scan a broad set of elements for a "Work Experience" title,
  //    then climb to the container that actually wraps the fields / Add button.
  const candidates = document.querySelectorAll(
    "h1, h2, h3, h4, h5, legend, [role='heading'], [data-automation-id$='Label'], [data-automation-id*='label'], div, span, p"
  );
  for (const h of candidates) {
    const text = (h.innerText || h.textContent || "").trim();
    // Must be a short heading-like string (avoid matching a whole page blob).
    // The container-has-inputs check below filters out nav/breadcrumb labels.
    if (text.length > 45 || !WORK_EXP_RE.test(text)) continue;

    // Climb until we reach a container that holds inputs or an Add button.
    let node = h;
    for (let i = 0; i < 6 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      const hasInputs = node.querySelector("input, textarea, select, button[aria-haspopup]");
      const hasAdd = findAddButton(node, { quiet: true });
      if (hasInputs || hasAdd) {
        console.log(`[RO] work-exp section via heading "${text}"`);
        return node;
      }
    }
  }
  console.warn("[RO] no Work Experience section found");
  return null;
}

/** Find the "Add" button for a section (Workday: aria-label/text "Add ..."). */
function findAddButton(section, opts = {}) {
  const candidates = section.querySelectorAll(
    'button, [role="button"], a[role="button"], [data-automation-id*="add" i], [data-automation-id*="Add"]'
  );
  for (const b of candidates) {
    if (!isVisible(b)) continue;
    const txt = (b.innerText || b.getAttribute("aria-label") || b.getAttribute("title") || "")
      .trim().toLowerCase();
    const auto = (b.getAttribute("data-automation-id") || "").toLowerCase();
    if (
      /\badd\b/.test(txt) ||
      txt.includes("add another") ||
      txt.includes("add work") ||
      txt.includes("add experience") ||
      auto === "add" || auto.includes("add-button") || /(^|[^a-z])add($|[^a-z])/.test(auto)
    ) {
      if (!opts.quiet) console.log(`[RO] add button: "${txt || auto}"`);
      return b;
    }
  }
  return null;
}

function getExperiencePanels(section) {
  // 1. Workday wraps each entry in an indexed panel container
  let panels = section.querySelectorAll(
    '[data-automation-id*="workExperience-"], [data-automation-id^="panel-"], [data-automation-id*="WorkExperience-"]'
  );
  if (panels.length) return Array.from(panels);

  // 2. Fallback: a panel is any group that contains a job-title OR company field.
  const anchorFields = section.querySelectorAll(
    '[data-automation-id="jobTitle"], [data-automation-id="company"], ' +
    'input[aria-label*="Job Title" i], input[aria-label*="Title" i], input[aria-label*="Company" i], input[aria-label*="Employer" i]'
  );
  const wrappers = [];
  const seenWrap = new Set();
  for (const f of anchorFields) {
    // Climb to a wrapper that groups the whole entry (has multiple fields)
    let node = f;
    for (let i = 0; i < 5 && node && node !== section; i++) {
      node = node.parentElement;
      if (node && node.querySelectorAll("input, textarea, select, button[aria-haspopup]").length >= 2) {
        if (!seenWrap.has(node)) { seenWrap.add(node); wrappers.push(node); }
        break;
      }
    }
  }
  return wrappers;
}

async function fillOneExperiencePanel(panel, exp) {
  const title = findFieldInPanel(panel, ["jobTitle"], ["job title", "title", "position"]);
  if (title) fireInput(title, exp.title || "");

  const company = findFieldInPanel(panel, ["company"], ["company", "employer", "organization"]);
  if (company) fireInput(company, exp.company || "");

  const location = findFieldInPanel(panel, ["location"], ["location", "city"]);
  if (location && exp.location) fireInput(location, exp.location);

  const desc = findFieldInPanel(panel, ["roleDescription", "description"], ["description", "responsibilities", "summary"]);
  if (desc && exp.bullets?.length) fireInput(desc, exp.bullets.join("\n"));

  // "I currently work here" checkbox if end date is present/ongoing
  const endParts = parseDateParts(exp.end);
  if (endParts?.present) {
    const cb = panel.querySelector(
      '[data-automation-id="currentlyWorkHere"] input, input[type="checkbox"][aria-label*="current" i]'
    );
    if (cb && !cb.checked) cb.click();
  }

  // Dates
  fillDateField(panel, "formField-startDate", parseDateParts(exp.start));
  if (!endParts?.present) fillDateField(panel, "formField-endDate", endParts);

  await new Promise((r) => setTimeout(r, 150));
}

/**
 * Fill the Work Experience section from profile entries.
 * For each experience: click "Add", wait for the new panel, fill it.
 */
async function fillWorkExperience(experiences) {
  if (!experiences.length) return { filled: 0, error: "No experience in profile." };

  const section = findWorkExperienceSection();
  if (!section) return { filled: 0, error: "Could not find a Work Experience section on this page." };

  section.scrollIntoView({ behavior: "smooth", block: "center" });
  await new Promise((r) => setTimeout(r, 300));

  let filled = 0;
  for (const exp of experiences) {
    const before = getExperiencePanels(section).length;
    const addBtn = findAddButton(section);
    if (!addBtn) {
      // No add button — maybe one blank panel already exists for the first entry
      const panels = getExperiencePanels(section);
      if (panels.length > filled) {
        await fillOneExperiencePanel(panels[panels.length - 1], exp);
        filled++;
        continue;
      }
      break;
    }

    addBtn.click();

    // Wait for a new panel to render
    const deadline = Date.now() + 2000;
    let panels = getExperiencePanels(section);
    while (panels.length <= before && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
      panels = getExperiencePanels(section);
    }
    if (panels.length === 0) break;

    await fillOneExperiencePanel(panels[panels.length - 1], exp);
    filled++;
  }

  return { filled };
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function isVisible(el) {
  if (!el) return false;
  if (el.offsetWidth === 0 && el.offsetHeight === 0 && el.getClientRects().length === 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

/** Radio / checkbox, native or ARIA. */
function isChoiceInput(el) {
  if (!el || el.nodeType !== 1) return false;
  const type = (el.type || "").toLowerCase();
  const role = (el.getAttribute?.("role") || "").toLowerCase();
  return type === "radio" || type === "checkbox" || role === "radio" || role === "checkbox";
}

/**
 * Ashby (and most modern ATS) render the real <input type="radio|checkbox">
 * with opacity:0 and paint a styled span in its place, so isVisible() reports
 * false for a control the user can plainly see. Judge those by whatever stands
 * in for them on screen instead.
 */
function isChoiceVisible(el) {
  if (isVisible(el)) return true;
  if (!isChoiceInput(el)) return false;
  const proxies = [
    el.parentElement,
    el.id ? document.querySelector(`label[for="${escapeCssAttr(el.id)}"]`) : null,
    el.closest?.('label, [class*="_option_"], [class*="option"]'),
  ];
  return proxies.some((p) => p && isVisible(p));
}

/** True if `el` is something we can actually write an answer into. */
function isFillTarget(el) {
  if (!el) return false;
  // Never text-fill a file input — the native value setter throws InvalidStateError.
  if (el.tagName === "INPUT" && (el.type || "").toLowerCase() === "file") return false;
  return isChoiceInput(el) ? isChoiceVisible(el) : isVisible(el);
}

function normalizeLabelText(str) {
  return String(str || "")
    .replace(/\s+/g, " ")
    .replace(/[\s*✱﹡]+$/g, "")
    .trim()
    .toLowerCase();
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + "\n[…truncated]" : str;
}

})();
