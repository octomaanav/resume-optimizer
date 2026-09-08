/**
 * sidebar.js — Side Panel UI Logic
 *
 * Three-tab layout (Autofill / Keywords Score / Profile).
 * All API calls go through background.js (service worker) via chrome.runtime.sendMessage.
 */

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  view: "autofill",       // "autofill" | "keywords" | "profile"
  settings: {
    appUrl: "http://localhost:3000",
    aiProvider: "ollama",
    geminiApiKey: "",
    ollamaBaseUrl: "http://127.0.0.1:11434",
    ollamaModel: "llama3.2",
    skillsMd: "",
    personalContext: "",
    profile: null,
    applicationAnswerDocs: [],   // synced from workspace — used for template matching
    demographics: null,          // voluntary self-ID answers, set by the user only
  },
  scraped: null,                // { jd, fields, resumeFileInputs?, url, title }
  results: null,                // { resume, coverLetter, answers }
  resumePdfBase64: null,
  resumePdfObjectUrl: null,
  lastResumeOptimize: null,
  selectedFields: new Set(),
  editableAnswers: [],
  hoursSaved: 0,                // persisted across sessions
  deterministicKeywordCache: new Map(),
};

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const viewAutofill = $("view-autofill");
const viewKeywords = $("view-keywords");
const viewProfile = $("view-profile");

const tabAutofill = $("tab-autofill");
const tabKeywords = $("tab-keywords");
const tabProfile = $("tab-profile");

const btnToggleView = $("btn-toggle-view");

// ─── Init ─────────────────────────────────────────────────────────────────────

function isContextInvalidatedError(err) {
  const msg = String(err?.message || err || "");
  return msg.includes("Extension context invalidated");
}

function safeAsync(fn) {
  return (...args) =>
    Promise.resolve()
      .then(() => fn(...args))
      .catch((e) => {
        if (isContextInvalidatedError(e)) return;
        console.error(e);
      });
}

async function init() {
  await loadSettings();
  bindEvents();
  bindAutoDetectListener();
  showView(state.view);

  renderProfileView();
  renderResumeName();
  renderHeroHours();
  renderAutofillQuestions([]);
  await refreshKeywordViews("");

  updateActiveTabLabels().catch(() => {});
  requestCachedScrape().catch(() => {});
  connectAndSync({ silent: true }).catch(() => {});
  updateResumeAttachHint();
}

// ─── Auto-detection bridge ────────────────────────────────────────────────────

function bindAutoDetectListener() {
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type !== "AUTO_DETECTED") return;
      handleAutoDetected(msg.payload);
    });
  } catch {
    // Extension reloaded — listener will be re-registered next time.
  }
}

function handleAutoDetected(payload) {
  if (!payload) return;
  const prevJd = state.scraped?.jd || "";
  state.scraped = payload;
  if ((!payload.jd || payload.jd.length < 150) && prevJd.length > 150) {
    state.scraped.jd = prevJd;
  }
  state.selectedFields = new Set((payload.fields || []).map((f) => f.selector));

  if (payload.title) {
    setText("job-card-title", payload.title);
  }
  if (payload.site || payload.url) {
    const site = payload.site || "Job Posting";
    setText("job-card-sub", `${site} · Updated recently`);
  }

  renderAutofillQuestions(payload.fields || []);
  refreshKeywordViews(state.scraped.jd || "").catch(console.error);
  updateResumeAttachHint();

  // Re-sync templates silently so the latest saved Q&A are always available.
  connectAndSync({ silent: true }).catch(() => {});
}

function renderResumeName() {
  const profile = state.settings.profile;
  const name = profile?.name ? `${profile.name.replace(/\s+/g, "_")}_resume` : "Resume";
  setText("af-resume-name", name);
  setText("kw-resume-name", name);
}

function renderAutofillQuestions(fields) {
  const list = $("af-questions-list");
  if (!list) return;

  const n = fields?.length || 0;

  if (!n) {
    list.innerHTML = `<div class="questions-empty muted">No application questions detected on this page yet.</div>`;
    const countText = $("af-review-count-text");
    if (countText) countText.textContent = "0";
    return;
  }

  const { common, unique } = classifyFields(fields);
  let reviewCount = 0;
  let completedCount = 0;

  const reviewItems = [];
  const completedItems = [];

  common.forEach((field) => {
    completedCount++;
    completedItems.push(field);
  });

  unique.forEach((field) => {
    const tmpl = findTemplateForQuestion(field.label);
    if (!tmpl?.templateAnswer?.trim()) {
      reviewCount++;
      reviewItems.push(field);
    } else {
      completedCount++;
      completedItems.push({ ...field, templateAnswer: tmpl.templateAnswer });
    }
  });

  const countEl = $("af-review-count-text");
  if (countEl) countEl.textContent = String(reviewCount);

  let html = "";

  // 1. Need to review / Skipped / Unfilled section
  if (reviewItems.length > 0) {
    html += `<div class="review-section-header">Need to review (${reviewItems.length})</div>`;
    reviewItems.forEach((item, index) => {
      const fieldId = `q-item-unfilled-${index}`;
      const options = item.options || [];
      const hasOptions = options.length >= 2;

      let optionsHtml = "";
      if (hasOptions) {
        optionsHtml = `
          <div class="qa-options-container" id="options-${fieldId}">
            <div class="qa-options-label">Select an option:</div>
            <div class="qa-options-grid">
              ${options.map((opt) => `
                <button type="button" class="qa-option-pill" data-value="${esc(opt)}" data-field-id="${fieldId}">
                  ${esc(opt)}
                </button>
              `).join("")}
            </div>
          </div>
        `;
      }

      html += `
        <div class="review-item-card" id="${fieldId}">
          <div class="review-item-main">
            <span class="badge-review-icon" title="Unfilled question">!</span>
            <div class="review-item-text">
              <span class="review-item-label">${esc(item.label)}</span>
            </div>
            <button class="btn-answer-inline" data-selector="${esc(item.selector)}" data-label="${esc(item.label)}" data-field-id="${fieldId}">
              ✏️ Answer
            </button>
          </div>
          <div class="qa-inline-drawer hidden" id="drawer-${fieldId}">
            ${optionsHtml}
            <textarea class="qa-inline-textarea" placeholder="${hasOptions ? 'Or type custom answer...' : 'Type your answer here...'}" rows="2"></textarea>
            <div class="qa-inline-actions">
              <button class="btn-inline-save" data-selector="${esc(item.selector)}" data-label="${esc(item.label)}" data-field-id="${fieldId}">
                Save &amp; Fill
              </button>
              <button class="btn-inline-cancel" data-field-id="${fieldId}">Cancel</button>
            </div>
          </div>
        </div>
      `;
    });
  }

  // 2. Completed / Filled section
  if (completedItems.length > 0) {
    html += `<div class="review-section-header" style="margin-top:14px;">Completed (${completedItems.length})</div>`;
    completedItems.forEach((item) => {
      const valPreview = item.commonValue || item.templateAnswer || "";
      html += `
        <div class="review-item-card completed-item-card">
          <div class="review-item-main">
            <span class="badge-completed-icon" title="Filled field">✓</span>
            <div class="review-item-text">
              <span class="review-item-label">${esc(item.label)}</span>
              ${valPreview ? `<span class="review-item-val">${esc(valPreview)}</span>` : ""}
            </div>
            <span class="badge-filled-pill">Filled</span>
          </div>
        </div>
      `;
    });
  }

  list.innerHTML = html;
  bindInlineAnswerListeners();

  const heroBtnText = $("btn-hero-text");
  if (heroBtnText) {
    heroBtnText.textContent = reviewCount > 0 || completedCount > 0 ? "Run Autofill Again ⚡" : "Autofill This Page";
  }
}

function bindInlineAnswerListeners() {
  const list = $("af-questions-list");
  if (!list) return;

  // Toggle answer drawer when clicking "✏️ Answer"
  list.querySelectorAll(".btn-answer-inline").forEach((btn) => {
    btn.addEventListener("click", () => {
      const fieldId = btn.dataset.fieldId;
      const drawer = $(`drawer-${fieldId}`);
      if (drawer) {
        drawer.classList.toggle("hidden");
        if (!drawer.classList.contains("hidden")) {
          drawer.querySelector("textarea")?.focus();
        }
      }
    });
  });

  // Option pill click listener for multiple choice questions
  list.querySelectorAll(".qa-option-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      const fieldId = pill.dataset.fieldId;
      const val = pill.dataset.value;
      const drawer = $(`drawer-${fieldId}`);
      if (!drawer) return;

      const container = $(`options-${fieldId}`);
      if (container) {
        container.querySelectorAll(".qa-option-pill").forEach((p) => p.classList.remove("active"));
      }
      pill.classList.add("active");

      const textarea = drawer.querySelector("textarea");
      if (textarea) {
        textarea.value = val;
      }
    });
  });

  // Cancel button
  list.querySelectorAll(".btn-inline-cancel").forEach((btn) => {
    btn.addEventListener("click", () => {
      const fieldId = btn.dataset.fieldId;
      $(`drawer-${fieldId}`)?.classList.add("hidden");
    });
  });

  // Save & Fill button
  list.querySelectorAll(".btn-inline-save").forEach((btn) => {
    btn.addEventListener("click", safeAsync(async () => {
      const selector = btn.dataset.selector;
      const label = btn.dataset.label;
      const fieldId = btn.dataset.fieldId;
      const drawer = $(`drawer-${fieldId}`);
      const textarea = drawer?.querySelector("textarea");
      const answer = textarea?.value?.trim();

      if (!answer) {
        textarea?.focus();
        return;
      }

      btn.disabled = true;
      btn.textContent = "Saving...";

      try {
        const now = Date.now();
        const newDoc = {
          id: `aa_${crypto.randomUUID()}`,
          title: label.slice(0, 80),
          createdAt: now,
          updatedAt: now,
          question: label,
          templateAnswer: answer,
          source: state.scraped?.site || "",
        };

        const allDocs = [...(state.settings.applicationAnswerDocs || []), newDoc];
        await sendToBackground({
          type: "SAVE_QA_TEMPLATES",
          payload: {
            appUrl: state.settings.appUrl || "http://localhost:3000",
            applicationAnswerDocs: allDocs,
          },
        });

        state.settings.applicationAnswerDocs = allDocs;
        chrome.storage.local.set({ applicationAnswerDocs: allDocs }).catch(() => {});

        // Immediately autofill this input field on the page!
        await sendToBackground({
          type: "RELAY_TO_CONTENT",
          payload: { type: "AUTOFILL", answers: [{ selector, label, text: answer }] },
        });

        // Re-render questions list to show as Completed (✓)
        renderAutofillQuestions(state.scraped?.fields || []);
      } finally {
        btn.disabled = false;
        btn.textContent = "Save & Fill";
      }
    }));
  });
}

const TECHNICAL_KEYWORDS_DICT = [
  // ── Languages & Scripting ──
  "Python", "C++", "C", "C#", "Java", "JavaScript", "TypeScript", "Go", "Golang", "Rust", "Ruby", "PHP", "Swift", "Kotlin", "Scala", "R", "SQL", "Bash", "Shell", "HTML", "CSS", "Sass", "Perl", "Haskell", "Elixir", "Assembly", "MATLAB",

  // ── AI, ML, Data Science & Infra ──
  "Machine Learning", "Deep Learning", "Artificial Intelligence", "AI", "TensorFlow", "PyTorch", "Keras", "Scikit-Learn", "Ray", "Pandas", "NumPy", "OpenCV", "NLP", "LLM", "LLMs", "Transformers", "Computer Vision", "Decision Trees", "Neural Networks", "GPU", "CUDA", "Model Deployment", "Model Serving", "ML Infrastructure", "MLOps", "Distributed Training", "ML Platforms", "GPU Serving", "Feature Engineering", "Data Pipelines", "ETL", "Apache Spark", "Hadoop", "Airflow", "Kafka", "Flink", "Databricks", "Snowflake", "BigQuery", "Data Warehouse", "Data Engineering", "Reinforcement Learning", "Generative AI", "Prompt Engineering", "Fine-Tuning",

  // ── Cloud, DevOps & Infrastructure ──
  "Docker", "Kubernetes", "AWS", "GCP", "Azure", "Cloud Technologies", "Terraform", "CI/CD", "Ansible", "Linux", "Unix", "Microservices", "Serverless", "Kubeflow", "Helm", "Distributed Systems", "Developer Tooling", "Infrastructure", "Prometheus", "Grafana", "Datadog", "Nginx", "Service Mesh", "Istio", "Cloudflare",

  // ── Web, Mobile & Frameworks ──
  "React", "React Native", "Next.js", "Vue", "Angular", "Node.js", "Express", "Django", "Flask", "FastAPI", "Spring Boot", "GraphQL", "REST API", "gRPC", "Tailwind", "Bootstrap", "WebSockets", "Electron", "Flutter", "Android", "iOS", "Redux", "Zustand", "Webpack", "Vite",

  // ── Databases & Caching ──
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch", "Cassandra", "DynamoDB", "Vector Database", "Supabase", "Prisma", "Firebase", "Neo4j", "SQLite", "CockroachDB",

  // ── Architecture & Computer Science ──
  "System Design", "Object-Oriented Programming", "OOP", "Functional Programming", "Data Structures", "Algorithms", "Performance Optimization", "Tradeoffs", "Latency", "Scalability", "High Availability", "Fault Tolerance", "Concurrency", "Multithreading", "Clean Code", "Design Patterns", "Refactoring",

  // ── Soft Skills, Leadership & Collaboration ──
  "Cross-Functional Collaboration", "Technical Leadership", "Mentorship", "Problem Solving", "Critical Thinking", "Stakeholder Management", "Project Management", "Agile", "Scrum", "Kanban", "Written Communication", "Verbal Communication", "Team Player", "Adaptability", "Time Management", "Ownership", "Analytical Thinking", "Conflict Resolution", "Customer Obsession", "Strategic Thinking", "Product Mindset", "Self-Driven",

  // ── Security, Testing & QA ──
  "Unit Testing", "Integration Testing", "End-to-End Testing", "Jest", "Cypress", "Playwright", "Test-Driven Development", "TDD", "Cybersecurity", "OAuth", "JWT", "Penetration Testing", "Compliance", "SOC2", "GDPR"
];

/**
 * Local fallback only — used when the app server can't be reached.
 *
 * Deliberately dictionary-only. An earlier version also harvested every
 * /\b[A-Z]{2,10}\b/ token as a "technical acronym", which meant a JD's
 * location and legal boilerplate (NYC, NY, EEO, E-Verify) dominated the
 * keyword list while real terms like "smart contracts" were missed entirely.
 * The authoritative extractor is the curated allowlist in
 * app/lib/jd-keyword-extract.ts, reached via EXTRACT_JD_KEYWORDS_DETERMINISTIC.
 */
function extractKeywordsFromTextLocal(jdText) {
  if (!jdText || typeof jdText !== "string" || !jdText.trim()) return [];
  const found = [];
  for (const kw of TECHNICAL_KEYWORDS_DICT) {
    const escKw = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|[^a-z0-9+#])${escKw}(?:$|[^a-z0-9+#])`, "i");
    if (re.test(jdText)) found.push(kw);
  }
  // Longer, more specific phrases first — same ordering intent as the server.
  return found.sort((a, b) => b.length - a.length).slice(0, 40);
}

/** Server-backed extraction, falling back to the local dictionary offline. */
async function extractKeywordsFromText(jdText) {
  if (!jdText || typeof jdText !== "string" || !jdText.trim()) return [];
  try {
    const res = await sendToBackground({
      type: "EXTRACT_JD_KEYWORDS_DETERMINISTIC",
      payload: { jd: jdText, settings: state.settings },
    });
    if (Array.isArray(res?.keywords) && res.keywords.length) {
      return res.keywords;
    }
  } catch {
    // fall through to the local dictionary
  }
  return extractKeywordsFromTextLocal(jdText);
}

async function computeMatchAsync(jd) {
  const profile = state.settings.profile;
  const profileText = profileToText(profile);
  const profileTextLower = profileText.toLowerCase();

  const keywords = await extractKeywordsFromText(jd);
  if (!keywords.length) {
    return { score: 0, matched: [], missing: [], keywords: [] };
  }

  const matched = [];
  const missing = [];

  for (const kw of keywords) {
    if (profileHas(profileTextLower, kw)) {
      matched.push(kw);
    } else {
      missing.push(kw);
    }
  }

  const score = Math.round((matched.length / keywords.length) * 100);
  return { score, matched, missing, keywords };
}

function setScoreDonuts(score, matchedCount, totalCount) {
  const displayScore = typeof score === "number" ? Math.max(0, Math.min(100, score)) : 0;
  const strokeColor = displayScore >= 70 ? "#10b981" : displayScore >= 40 ? "#f59e0b" : "#f43f5e";
  const dasharray = `${displayScore}, 100`;

  const arc1 = $("score-donut-arc");
  if (arc1) {
    arc1.setAttribute("stroke-dasharray", dasharray);
    arc1.setAttribute("stroke", strokeColor);
  }
  setText("score-donut-text", String(displayScore));
  setText("af-matched-count", String(matchedCount));
  setText("af-total-count", String(totalCount));

  const arc2 = $("kw-gauge-arc");
  if (arc2) {
    arc2.setAttribute("stroke-dasharray", dasharray);
    arc2.setAttribute("stroke", strokeColor);
  }
  setText("kw-gauge-score", String(displayScore));
  setText("kw-matched-count", String(matchedCount));
  setText("kw-total-count", String(totalCount));

  const matchTitle = totalCount === 0
    ? "No Job Posted"
    : displayScore >= 70
    ? "High Resume Match"
    : displayScore >= 40
    ? "Good Resume Match"
    : "Low Resume Match";

  setText("score-widget-label", matchTitle);
  setText("kw-headline", matchTitle);
}

async function refreshKeywordViews(jd) {
  await renderAutofillKeywordSummary(jd);
  await renderKeywordsView(jd);
}

async function renderAutofillKeywordSummary(jd) {
  const { score, matched, keywords } = await computeMatchAsync(jd);
  setScoreDonuts(score, matched.length, keywords.length);
}

async function renderKeywordsView(jd) {
  const m = await computeMatchAsync(jd);
  const { score, matched, missing, keywords } = m;

  const tip = $("kw-tip-text");
  const grid = $("kw-grid");

  setScoreDonuts(score, matched.length, keywords.length);

  if (tip) {
    if (keywords.length === 0) {
      tip.innerHTML = `Open a job posting to see keyword breakdown.`;
    } else if (score >= 70) {
      tip.innerHTML = `Great job! Your resume covers <strong>${score}%</strong> (${matched.length}/${keywords.length}) of the job's key requirements.`;
    } else {
      tip.innerHTML = `Your resume score is <strong>${score}%</strong>. Try adding missing keywords to your profile to increase your match rate!`;
    }
  }

  if (grid) {
    if (keywords.length === 0) {
      grid.innerHTML = `<div class="kw-grid-empty muted" style="padding:12px;text-align:center;font-size:12.5px;">No active job description detected on this tab. Tap Re-scan on the Autofill tab to scan this page.</div>`;
    } else {
      const rows = [
        ...matched.map((k) => ({ k, matched: true })),
        ...missing.map((k) => ({ k, matched: false })),
      ];

      grid.innerHTML = rows.map((r) => `
        <span class="kw-pill ${r.matched ? "kw-pill-matched" : "kw-pill-missing"}" title="${esc(r.k)}">
          ${esc(r.k)}
        </span>
      `).join("");
    }
  }
}

async function requestCachedScrape() {
  const response = await sendToBackground({
    type: "RELAY_TO_CONTENT",
    payload: { type: "GET_LAST_SCRAPE" },
  }).catch(() => null);

  if (response && !response.error && (response.fields || response.jd)) {
    handleAutoDetected(response);
  }
}

const DEFAULT_STANDALONE_PROFILE = {
  name: "Manav Sharma",
  email: "manavsharma@example.com",
  phone: "+1 (555) 019-2834",
  location: "Buffalo, NY",
  education: [
    {
      id: "edu-1",
      school: "University at Buffalo - SUNY",
      degree: "Bachelor of Science in Computer Science",
      start: "Aug 2023",
      end: "May 2027",
      details: [
        "GPA: 3.8 / 4.0",
        "Relevant Coursework: Data Structures, Algorithms, Operating Systems, Machine Learning",
      ],
    },
  ],
  experience: [
    {
      id: "exp-1",
      company: "Tech Solutions Inc.",
      title: "Software Engineering Intern",
      location: "New York, NY",
      start: "May 2025",
      end: "Aug 2025",
      bullets: [
        "Architected and deployed full-stack features using React, Next.js, and TypeScript, improving user engagement by **25%**.",
        "Optimized backend REST API endpoints and SQL database queries, reducing average response latency by **40ms**.",
      ],
    },
  ],
  projects: [
    {
      id: "proj-1",
      name: "AI Resume & Job Application Optimizer",
      role: "Lead Developer",
      start: "Jan 2026",
      end: "Present",
      tech: ["TypeScript", "Next.js", "Tailwind CSS", "Ollama", "Supabase"],
      bullets: [
        "Engineered an autonomous Chrome extension & web app for AI-powered resume tailoring and automated job application filling.",
        "Integrated local LLMs via Ollama to generate context-aware answers and customized LaTeX resumes.",
      ],
    },
  ],
  skills: [
    "TypeScript",
    "React",
    "Next.js",
    "Node.js",
    "Python",
    "C++",
    "Tailwind CSS",
    "Git",
    "Docker",
    "SQL",
  ],
};

function normalizeOllamaBaseUrl(url) {
  let u = (url || "http://127.0.0.1:11434").trim().replace(/\/$/, "");
  u = u.replace(/^http:\/\/localhost/i, "http://127.0.0.1");
  return u;
}

function mergeAiSettings(from) {
  const provider = from?.aiProvider === "gemini" ? "gemini" : "ollama";
  state.settings.aiProvider = provider;
  state.settings.geminiApiKey = (from?.geminiApiKey || "").trim();
  state.settings.ollamaBaseUrl = normalizeOllamaBaseUrl(from?.ollamaBaseUrl);
  state.settings.ollamaModel = (from?.ollamaModel || "llama3.2").trim();
}

function isAiConfigured() {
  return !!state.settings.profile;
}

function aiSetupErrorMessage() {
  return "Profile ready. Run `ollama serve` locally before optimizing.";
}

// EEOC / voluntary self-identification answers. Every field defaults to
// declining — a protected characteristic is never inferred from the profile,
// it is only ever what the user typed here.
const DEMOGRAPHIC_KEYS = ["gender", "race", "hispanic", "veteran", "disability", "pronouns"];
const DEFAULT_DEMOGRAPHICS = {
  gender: "",
  race: "",
  hispanic: "",
  veteran: "",
  disability: "",
  pronouns: "",
};

async function loadSettings() {
  const stored = await chrome.storage.local.get([
    "appUrl",
    "aiProvider",
    "geminiApiKey",
    "ollamaBaseUrl",
    "ollamaModel",
    "skillsMd",
    "personalContext",
    "profile",
    "hoursSaved",
    "applicationAnswerDocs",
    "demographics",
  ]);
  state.settings.appUrl = stored.appUrl || "http://localhost:3000";
  mergeAiSettings(stored);
  state.settings.skillsMd = stored.skillsMd || "";
  state.settings.personalContext = stored.personalContext || "";
  
  if (!stored.profile) {
    state.settings.profile = DEFAULT_STANDALONE_PROFILE;
    chrome.storage.local.set({ profile: DEFAULT_STANDALONE_PROFILE }).catch(() => {});
  } else {
    state.settings.profile = stored.profile;
  }

  state.settings.applicationAnswerDocs = Array.isArray(stored.applicationAnswerDocs)
    ? stored.applicationAnswerDocs
    : [];
  state.settings.demographics = { ...DEFAULT_DEMOGRAPHICS, ...(stored.demographics || {}) };
  state.hoursSaved = Number(stored.hoursSaved || 0);

  const inp = $("inp-app-url");
  if (inp) inp.value = state.settings.appUrl;
  renderDemographics();
}

/** Populate the self-ID inputs from storage. */
function renderDemographics() {
  const d = state.settings.demographics || DEFAULT_DEMOGRAPHICS;
  for (const key of DEMOGRAPHIC_KEYS) {
    const el = $(`demo-${key}`);
    if (el) el.value = d[key] || "";
  }
}

/** Persist the self-ID inputs as the user edits them. */
function saveDemographics() {
  const next = { ...DEFAULT_DEMOGRAPHICS };
  for (const key of DEMOGRAPHIC_KEYS) {
    const el = $(`demo-${key}`);
    if (el) next[key] = el.value.trim();
  }
  state.settings.demographics = next;
  chrome.storage.local.set({ demographics: next }).catch(() => {});
}

// ─── View switching ───────────────────────────────────────────────────────────

function showView(view) {
  state.view = view;
  viewAutofill?.classList.toggle("hidden", view !== "autofill");
  viewKeywords?.classList.toggle("hidden", view !== "keywords");
  viewProfile?.classList.toggle("hidden", view !== "profile");

  for (const [tab, name] of [
    [tabAutofill, "autofill"],
    [tabKeywords, "keywords"],
    [tabProfile, "profile"],
  ]) {
    tab?.classList.toggle("active", view === name);
    tab?.setAttribute("aria-selected", String(view === name));
  }

  btnToggleView?.classList.toggle("active", view === "profile");
}

// ─── Event bindings ───────────────────────────────────────────────────────────

function bindEvents() {
  // Header
  $("btn-close-overlay").addEventListener("click", () => {
    window.parent.postMessage({ type: "RO_CLOSE" }, "*");
  });
  btnToggleView?.addEventListener("click", () => {
    showView(state.view === "profile" ? "autofill" : "profile");
  });
  $("btn-report")?.addEventListener("click", () => {
    openAppPath("/feedback");
  });

  // Tabs
  tabAutofill?.addEventListener("click", () => showView("autofill"));
  tabKeywords?.addEventListener("click", () => showView("keywords"));
  tabProfile?.addEventListener("click", () => showView("profile"));

  // Autofill tab actions
  $("btn-hero-autofill")?.addEventListener("click", safeAsync(handleHeroAutofill));
  $("btn-save-job")?.addEventListener("click", () => openAppPath("/jobs/new"));
  $("btn-referrals")?.addEventListener("click", () => openAppPath("/referrals"));
  $("af-resume-selector")?.addEventListener("click", () => openAppPath("/profile"));
  $("af-resume-preview")?.addEventListener("click", () => openAppPath("/resumes"));
  $("btn-optimize-resume-ext")?.addEventListener("click", safeAsync(handleExtensionResumeOptimize));
  $("btn-tailor-resume-mini")?.addEventListener("click", safeAsync(handleExtensionResumeOptimize));
  $("btn-tailor-resume-big")?.addEventListener("click", safeAsync(handleExtensionResumeOptimize));
  $("btn-attach-tailored-resume")?.addEventListener("click", safeAsync(handleAttachTailoredResume));
  $("btn-view-pdf-tab")?.addEventListener("click", () => {
    if (state.resumePdfObjectUrl) {
      chrome.tabs.create({ url: state.resumePdfObjectUrl });
    }
  });
  $("btn-open-app-resume")?.addEventListener("click", () => openAppPath("/optimize/resume"));
  $("btn-tailor-application")?.addEventListener("click", () => openAppPath("/optimize"));
  $("btn-questions-rescan")?.addEventListener("click", safeAsync(handleScrape));
  $("btn-autofill-all-questions")?.addEventListener("click", safeAsync(handleAutofillAll));
  $("btn-fill-experience")?.addEventListener("click", safeAsync(handleFillWorkExperience));
  $("btn-answer-new-questions")?.addEventListener("click", safeAsync(handleAnswerNewQuestions));
  $("btn-qa-new-save")?.addEventListener("click", safeAsync(handleSaveQaTemplates));
  $("btn-qa-new-close")?.addEventListener("click", () => $("qa-new-form")?.classList.add("hidden"));

  // Keywords tab actions
  $("btn-open-optimize-app")?.addEventListener("click", () => openAppPath("/optimize/resume"));

  // Profile tab actions
  $("btn-job-matches")?.addEventListener("click", () => openAppPath("/jobs/matches"));
  $("btn-job-tracker")?.addEventListener("click", () => openAppPath("/jobs"));
  $("btn-edit-profile")?.addEventListener("click", () => openAppPath("/profile"));
  $("btn-refresh-profile")?.addEventListener("click", safeAsync(() => connectAndSync({ silent: false })));
  $("btn-open-app")?.addEventListener("click", safeAsync(handleOpenApp));
  $("btn-connect")?.addEventListener("click", safeAsync(() => connectAndSync({ silent: false })));
  $("btn-open-profile")?.addEventListener("click", () => showView("profile"));

  // Voluntary self-identification answers
  for (const key of DEMOGRAPHIC_KEYS) {
    $(`demo-${key}`)?.addEventListener("change", saveDemographics);
  }

  // Legacy hidden buttons (kept so handlers don't throw if referenced)
  $("btn-detect-questions")?.addEventListener("click", safeAsync(handleScrape));
  $("btn-rescrape")?.addEventListener("click", safeAsync(handleScrape));
  $("btn-optimize")?.addEventListener("click", safeAsync(handleOptimize));
  $("btn-back")?.addEventListener("click", () => {});
  $("btn-autofill")?.addEventListener("click", safeAsync(handleAutofill));
}

// ─── Global error hardening ──────────────────────────────────────────────────

window.addEventListener("unhandledrejection", (event) => {
  const msg = String(event?.reason?.message || event?.reason || "");
  if (msg.includes("Extension context invalidated")) event.preventDefault();
});
window.addEventListener("error", (event) => {
  const msg = String(event?.error?.message || event?.message || "");
  if (msg.includes("Extension context invalidated")) event.preventDefault();
});

// ─── Profile / Connect ───────────────────────────────────────────────────────

function renderResumeName() {
  const name = state.settings.profile?.name?.trim();
  const label = name ? `${slugifyName(name)}_resume (default)` : "No resume connected";
  const af = $("af-resume-name");
  const kw = $("kw-resume-name");
  if (af) af.textContent = label;
  if (kw) kw.textContent = label;
}

function slugifyName(name) {
  return name.replace(/\s+/g, "_").replace(/[^A-Za-z0-9_]/g, "");
}

function renderHeroHours() {
  const hrs = $("hero-hours-saved");
  if (!hrs) return;
  const n = state.hoursSaved | 0;
  hrs.textContent = `${n} hour${n === 1 ? "" : "s"}`;
}

function renderProfileView() {
  const profile = state.settings.profile;
  const disconnected = $("profile-disconnected");

  if (!profile) {
    disconnected?.classList.remove("hidden");
    setText("prof-name", "Not connected");
    setText("prof-avatar", "?");
    setText("prof-location", "—");
    setText("prof-email", "—");
    setText("prof-phone", "—");
    setHtml("prof-education", "");
    setHtml("prof-experience", "");
    setHtml("prof-projects", "");
    $("prof-projects-title")?.classList.add("hidden");
    return;
  }

  disconnected?.classList.add("hidden");

  setText("prof-name", profile.name || "—");
  setText("prof-avatar", initials(profile.name));
  setText("prof-location", profile.location || "—");
  setText("prof-email", profile.email || "—");
  setText("prof-phone", profile.phone || "—");

  bindCopyable("prof-location");
  bindCopyable("prof-email");
  bindCopyable("prof-phone");

  setHtml("prof-education", renderEducation(profile.education || []));
  setHtml("prof-experience", renderExperience(profile.experience || []));

  const projects = profile.projects || [];
  if (projects.length) {
    $("prof-projects-title")?.classList.remove("hidden");
    setHtml("prof-projects", renderProjects(projects));
  } else {
    $("prof-projects-title")?.classList.add("hidden");
    setHtml("prof-projects", "");
  }
}

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase();
}

function renderEducation(items) {
  if (!items.length) return `<div class="muted" style="font-size:12px;">No education entries.</div>`;
  return items.map((e) => `
    <div class="profile-entry">
      <div class="profile-entry-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M22 10L12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
        </svg>
      </div>
      <div class="profile-entry-body">
        <div class="profile-entry-title">${esc(e.school || "—")}</div>
        <div class="profile-entry-meta">${esc(e.degree || "")}</div>
        <div class="profile-entry-dates">${esc(formatYears(e.start, e.end))}</div>
        ${(e.details || []).length ? `<ul class="profile-entry-bullets">${(e.details || []).map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}
      </div>
    </div>
  `).join("");
}

function renderExperience(items) {
  if (!items.length) return `<div class="muted" style="font-size:12px;">No experience entries.</div>`;
  return items.map((e) => `
    <div class="profile-entry">
      <div class="profile-entry-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
        </svg>
      </div>
      <div class="profile-entry-body">
        <div class="profile-entry-title">${esc(e.title || "—")}</div>
        <div class="profile-entry-meta">${esc([e.company, e.location].filter(Boolean).join(" • "))}</div>
        <div class="profile-entry-dates">${esc(formatYears(e.start, e.end))}</div>
        ${(e.bullets || []).length ? `<ul class="profile-entry-bullets">${(e.bullets || []).map((b) => `<li>${bulletHtml(b)}</li>`).join("")}</ul>` : ""}
      </div>
    </div>
  `).join("");
}

function renderProjects(items) {
  return items.map((p) => `
    <div class="profile-entry">
      <div class="profile-entry-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      </div>
      <div class="profile-entry-body">
        <div class="profile-entry-title">${esc(p.name || "—")}</div>
        <div class="profile-entry-meta">${esc([p.role, (p.tech || []).slice(0, 4).join(", ")].filter(Boolean).join(" • "))}</div>
        <div class="profile-entry-dates">${esc(formatYears(p.start, p.end))}</div>
        ${(p.bullets || []).length ? `<ul class="profile-entry-bullets">${(p.bullets || []).map((b) => `<li>${bulletHtml(b)}</li>`).join("")}</ul>` : ""}
      </div>
    </div>
  `).join("");
}

function formatYears(start, end) {
  const s = (start || "").trim();
  const e = (end || "").trim();
  if (!s && !e) return "";
  return `${s || ""}${s && (e || "Present") ? " – " : ""}${e || (s ? "Present" : "")}`;
}

function bindCopyable(id) {
  const el = $(id);
  if (!el) return;
  el.classList.add("copyable");
  el.title = "Click to copy";
  el.onclick = () => {
    const text = el.textContent || "";
    if (!text || text === "—") return;
    try {
      navigator.clipboard.writeText(text).then(() => flashCopied(el));
    } catch {
      // fallback: select-and-copy
      const r = document.createRange();
      r.selectNode(el);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(r);
      try { document.execCommand("copy"); flashCopied(el); } catch {}
      window.getSelection()?.removeAllRanges();
    }
  };
}

function flashCopied(el) {
  el.classList.add("copied");
  const original = el.textContent;
  el.textContent = "Copied!";
  setTimeout(() => {
    el.classList.remove("copied");
    el.textContent = original;
  }, 900);
}

async function handleOpenApp() {
  const base = ($("inp-app-url")?.value || state.settings.appUrl || "http://localhost:3000")
    .trim().replace(/\/$/, "");
  await chrome.tabs.create({ url: base });
}

function openAppPath(path) {
  const base = (state.settings.appUrl || "http://localhost:3000").trim().replace(/\/$/, "");
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
  chrome.tabs.create({ url }).catch(() => {});
}

async function connectAndSync({ silent }) {
  const statusEl = $("connect-status");
  const errEl = $("profile-error");
  const okEl = $("profile-success");

  errEl?.classList.add("hidden");
  okEl?.classList.add("hidden");

  const appUrl = ($("inp-app-url")?.value || state.settings.appUrl || "http://localhost:3000")
    .trim().replace(/\/$/, "");

  if (statusEl && !silent) {
    statusEl.textContent = "Connecting…";
    statusEl.style.color = "var(--muted)";
  }

  const response = await sendToBackground({ type: "SYNC_PROFILE", appUrl });

  if (response?.error) {
    if (statusEl) {
      statusEl.style.color = "var(--muted)";
      statusEl.textContent = silent
        ? "Standalone / Local Storage Active"
        : `Local Storage Active (web app offline)`;
    }
    renderProfileView();
    renderResumeName();
    return;
  }

  const { profile, settings, applicationAnswerDocs: syncedDocs } = response || {};
  const skillsMd = settings?.skillsMd || state.settings.skillsMd || "";
  const personalContext = settings?.personalContext || state.settings.personalContext || "";
  const aiProvider = settings?.aiProvider === "gemini" ? "gemini" : "ollama";
  const geminiApiKey = (settings?.geminiApiKey || "").trim();
  const ollamaBaseUrl = (settings?.ollamaBaseUrl || "http://127.0.0.1:11434").trim();
  const ollamaModel = (settings?.ollamaModel || "llama3.2").trim();
  const applicationAnswerDocs = Array.isArray(syncedDocs) ? syncedDocs : [];

  state.settings = {
    appUrl,
    aiProvider,
    geminiApiKey,
    ollamaBaseUrl,
    ollamaModel,
    skillsMd,
    personalContext,
    profile,
    applicationAnswerDocs,
    // Local-only, never synced from the web app — carry it across the reassign.
    demographics: state.settings.demographics || { ...DEFAULT_DEMOGRAPHICS },
  };
  await chrome.storage.local
    .set({
      appUrl,
      aiProvider,
      geminiApiKey,
      ollamaBaseUrl,
      ollamaModel,
      skillsMd,
      personalContext,
      profile,
      applicationAnswerDocs,
    })
    .catch(() => {});

  renderProfileView();
  renderResumeName();
  await refreshKeywordViews(state.scraped?.jd || "");

  if (statusEl && !silent) {
    statusEl.style.color = "var(--success-fg)";
    statusEl.textContent = "Connected.";
  }
  okEl?.classList.remove("hidden");
  setTimeout(() => okEl?.classList.add("hidden"), 1500);
}

// ─── Page label sync ─────────────────────────────────────────────────────────

async function updateActiveTabLabels() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.title) setText("af-page-title", tab.title);
    if (tab?.url) setText("af-page-url", tab.url);
  } catch {
    // ignore
  }
}

// ─── Scrape (force re-scan) ──────────────────────────────────────────────────

async function handleScrape() {
  const rescanBtn = $("btn-questions-rescan");
  const spanEl = rescanBtn?.querySelector("span");
  if (rescanBtn) { rescanBtn.disabled = true; if (spanEl) spanEl.textContent = "Scanning…"; }

  const response = await sendToBackground({
    type: "RELAY_TO_CONTENT",
    payload: { type: "SCRAPE" },
  });

  if (rescanBtn) { rescanBtn.disabled = false; if (spanEl) spanEl.textContent = "Re-scan"; }

  if (!response || response.error) {
    setScanStatus(`Scan failed: ${response?.error || "no response"}`, "error");
    return;
  }

  state.scraped = response;
  state.selectedFields = new Set((response.fields || []).map((f) => f.selector));
  renderAutofillQuestions(response.fields || []);
  await refreshKeywordViews(response.jd || "");
  updateResumeAttachHint();

  const n = (response.fields || []).length;
  setScanStatus(
    n > 0 ? `Found ${n} question${n === 1 ? "" : "s"}.` : "No application questions found on this page.",
    n > 0 ? "ok" : "warn"
  );

  // If questions were found but there are no saved templates at all, open the
  // inline form immediately so the user can add answers without an extra click.
  if (n > 0 && !(state.settings.applicationAnswerDocs || []).length) {
    showQaInlineForm(response.fields);
  }
}

// ─── Fill work experience from profile ───────────────────────────────────────

async function handleFillWorkExperience() {
  const errEl = $("af-error");
  const okEl = $("autofill-result");
  errEl?.classList.add("hidden");
  okEl?.classList.add("hidden");

  const experiences = state.settings.profile?.experience || [];
  if (!experiences.length) {
    showError(errEl, "No experience in your profile. Connect & Sync on the Profile tab first.");
    return;
  }

  const btn = $("btn-fill-experience");
  if (btn) { btn.disabled = true; btn.textContent = "Filling experience…"; }

  try {
    const response = await sendToBackground({
      type: "RELAY_TO_CONTENT",
      payload: { type: "FILL_WORK_EXPERIENCE", experiences },
    });

    if (response?.error) {
      showError(errEl, response.error);
      return;
    }
    const filled = response?.filled ?? 0;
    if (filled > 0) {
      showSuccess(okEl, `Filled ${filled} work experience entr${filled === 1 ? "y" : "ies"}. Review dates/dropdowns before submitting.`);
    } else {
      showError(errEl, "Could not fill experience — no Work Experience section detected on this page.");
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Fill work experience from profile"; }
  }
}

function setScanStatus(msg, type) {
  const el = $("af-scan-status");
  if (!el) return;
  el.textContent = msg;
  el.className = `scan-status scan-status-${type}`;
}

// ─── Hero autofill (full pipeline) ───────────────────────────────────────────

async function handleHeroAutofill() {
  const errEl = $("af-error");
  const okEl = $("autofill-result");
  errEl?.classList.add("hidden");
  okEl?.classList.add("hidden");

  // Re-scrape if page reloaded or no fields cached
  if (!state.scraped || !(state.scraped.fields || []).length) {
    await handleScrape();
  }

  const fields = state.scraped?.fields || [];
  if (!fields.length) {
    showError(errEl, "No job application input fields detected on this page yet. Tap Re-scan to scan.");
    return;
  }

  // Select all detected fields
  state.selectedFields = new Set(fields.map((f) => f.selector));

  const card = $("questions-card");
  const progView = $("questions-card-progress");
  const resView = $("questions-card-results");

  if (card) card.classList.remove("hidden");
  if (progView) progView.classList.remove("hidden");
  if (resView) resView.classList.add("hidden");

  setText("step-detected-count", `${fields.length} fields detected`);

  const liveList = $("step-live-fields");
  if (liveList) {
    liveList.innerHTML = fields.slice(0, 5).map((f) => `
      <div class="step-item step-done">
        <span class="step-check">✓</span>
        <span>${esc(f.label || "Input field")}</span>
      </div>
    `).join("");
  }

  setHeroLoading(true);
  try {
    await handleOptimize();
    if (state.editableAnswers.length) {
      await handleAutofill();
    }
  } catch (e) {
    console.error("[RO] Autofill pipeline error:", e);
  } finally {
    setHeroLoading(false);
    if (progView) progView.classList.add("hidden");
    if (resView) resView.classList.remove("hidden");
    renderAutofillQuestions(state.scraped?.fields || []);
  }
}

function setHeroLoading(loading) {
  const btn = $("btn-hero-autofill");
  if (!btn) return;
  btn.disabled = loading;
  const textEl = $("btn-hero-text");
  if (textEl) {
    textEl.textContent = loading ? "Autofilling page..." : "Run Autofill Again ⚡";
  }
}

async function handleOptimize() {
  if (!state.scraped) return;
  const selectedQuestions = (state.scraped.fields || []).filter((f) =>
    state.selectedFields.has(f.selector)
  );

  // Common fields fill from profile; unique fields from saved templates. No AI.
  state.editableAnswers = buildEditableAnswers(selectedQuestions);
  console.log(`[RO] editableAnswers:`, state.editableAnswers.length, "fillable out of", selectedQuestions.length, "selected");
  state.results = { answers: [] };
}

async function handleAutofill() {
  if (!state.editableAnswers.length) return;
  const answersToFill = state.editableAnswers.filter((a) => a.text?.trim());
  if (!answersToFill.length) return;

  const response = await sendToBackground({
    type: "RELAY_TO_CONTENT",
    payload: { type: "AUTOFILL", answers: answersToFill },
  });

  if (response?.error) {
    showError($("af-error"), `Autofill failed: ${response.error}`);
    return;
  }

  const { filled = 0, skipped = 0 } = response || {};
  showSuccess($("autofill-result"),
    `Filled ${filled} field${filled !== 1 ? "s" : ""}${skipped ? ` (${skipped} skipped)` : ""}.`);

  // Bump hours-saved counter (~3 min per field, capped per session).
  if (filled > 0) {
    state.hoursSaved += Math.max(1, Math.round((filled * 3) / 60));
    chrome.storage.local.set({ hoursSaved: state.hoursSaved }).catch(() => {});
    renderHeroHours();
  }
}

// ─── Extension: optimize résumé + PDF + attach ───────────────────────────────

function disposeResumePdfObjectUrl() {
  if (state.resumePdfObjectUrl) {
    try {
      URL.revokeObjectURL(state.resumePdfObjectUrl);
    } catch {
      // ignore
    }
    state.resumePdfObjectUrl = null;
  }
}

function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function updateResumeAttachHint() {
  const hint = $("ro-attach-hint");
  if (!hint) return;
  const inputs = state.scraped?.resumeFileInputs || [];
  if (inputs.length === 0) {
    hint.textContent =
      "No résumé upload field detected yet. Open the step that asks for your résumé/CV and tap Re-scan, then attach.";
  } else if (inputs.length === 1) {
    hint.textContent = `Ready to attach to: ${inputs[0].label}`;
  } else {
    hint.textContent = `${inputs.length} upload fields found — attaches to the first (${inputs[0].label}).`;
  }
}

function renderResumeOptimizePanel() {
  const iframe = $("ro-resume-pdf-iframe");
  if (iframe) {
    iframe.src = state.resumePdfObjectUrl || "";
  }

  const badge = $("ro-resume-badge");
  const changes = state.lastResumeOptimize?.bulletChanges || [];
  if (badge) {
    badge.textContent = changes.length
      ? `${changes.length} bullet${changes.length === 1 ? "" : "s"} updated`
      : "No bullet edits";
  }

  const box = $("ro-bullet-changes");
  if (box) {
    if (!changes.length) {
      box.innerHTML = `<div class="muted ro-bc-empty">No wording changes were detected versus your profile bullets. The PDF still reflects your profile with any minor normalizations from the model.</div>`;
    } else {
      box.innerHTML = changes.map((c) => renderOneBulletChange(c)).join("");
    }
  }
}

function renderOneBulletChange(c) {
  const kind = c.kind === "experience" ? "Experience" : "Project";
  const rationale = c.rationale?.trim()
    ? `<div class="ro-bc-note">${esc(c.rationale)}</div>`
    : `<div class="ro-bc-note muted">Wording adjusted to align with this job description while staying truthful to your profile.</div>`;
  return `
    <div class="ro-bc-card">
      <div class="ro-bc-meta">${esc(kind)} — ${esc(c.label)} <span class="muted">#${c.index + 1}</span></div>
      <div class="ro-bc-before"><span class="ro-bc-tag">Before</span>${esc(c.before)}</div>
      <div class="ro-bc-after"><span class="ro-bc-tag">After</span>${bulletHtml(c.after)}</div>
      ${rationale}
    </div>
  `;
}

async function handleExtensionResumeOptimize() {
  await runExtensionResumeOptimize({ autoAttach: false });
}

/**
 * Backend: AI bullet rewrite → PDF → optional attach to detected upload field.
 * @returns {Promise<boolean>} false if optimization failed
 */
async function runExtensionResumeOptimize({ autoAttach }) {
  const errEl = $("af-error");
  const okEl = $("autofill-result");
  errEl?.classList.add("hidden");
  if (!autoAttach) okEl?.classList.add("hidden");

  if (!isAiConfigured()) {
    showView("profile");
    showError(errEl, aiSetupErrorMessage());
    return false;
  }

  if (!(state.scraped?.jd || "").trim()) {
    showError(
      errEl,
      "No job description on this page yet. Open the job posting or application step with the JD visible, then Re-scan.",
    );
    return false;
  }

  const mainBtn = $("btn-optimize-resume-ext");
  const mini = $("btn-tailor-resume-mini");
  const big = $("btn-tailor-resume-big");
  const busy = [mainBtn, mini, big].filter(Boolean);
  const prevMainHtml = mainBtn?.innerHTML;
  busy.forEach((b) => {
    b.disabled = true;
  });
  if (mainBtn) {
    mainBtn.innerHTML = `<span class="spinner"></span><span>Optimizing…</span>`;
  }

  try {
    const response = await sendToBackground({
      type: "OPTIMIZE_RESUME",
      payload: {
        jd: state.scraped?.jd || "",
        profile: state.settings.profile,
        settings: state.settings,
      },
    });

    if (response?.error) {
      showError(errEl, response.error);
      return false;
    }

    state.lastResumeOptimize = response.resume;
    state.resumePdfBase64 = response.pdfBase64;
    disposeResumePdfObjectUrl();
    if (response.pdfBase64) {
      state.resumePdfObjectUrl = URL.createObjectURL(
        base64ToBlob(response.pdfBase64, "application/pdf"),
      );
    }

    renderResumeOptimizePanel();
    $("ro-resume-panel")?.classList.remove("hidden");
    showView("autofill");
    updateResumeAttachHint();

    const changeCount = state.lastResumeOptimize?.bulletChanges?.length ?? 0;
    const inputs = state.scraped?.resumeFileInputs || [];

    if (autoAttach && inputs.length && state.resumePdfBase64) {
      const attach = await sendToBackground({
        type: "RELAY_TO_CONTENT",
        payload: {
          type: "ATTACH_RESUME_PDF",
          selector: inputs[0].selector,
          base64Pdf: state.resumePdfBase64,
          filename: response.filename || "resume-tailored.pdf",
        },
      });
      if (attach?.error || !attach?.ok) {
        showError(
          errEl,
          attach?.error ||
            "Résumé optimized but attach failed. Open the upload step and tap Attach PDF.",
        );
        return true;
      }
      showSuccess(
        okEl,
        `Résumé optimized (${changeCount} bullet${changeCount === 1 ? "" : "s"} updated) and attached.`,
      );
    } else if (autoAttach && !inputs.length) {
      showSuccess(
        okEl,
        `Résumé optimized (${changeCount} bullet${changeCount === 1 ? "" : "s"} updated). Open the upload step and tap Attach PDF.`,
      );
    }

    return true;
  } finally {
    busy.forEach((b) => {
      b.disabled = false;
    });
    if (mainBtn && prevMainHtml) mainBtn.innerHTML = prevMainHtml;
  }
}

async function handleAttachTailoredResume() {
  const errEl = $("af-error");
  errEl?.classList.add("hidden");

  if (!state.resumePdfBase64) {
    showError(errEl, "Optimize the résumé first.");
    return;
  }

  const inputs = state.scraped?.resumeFileInputs || [];
  if (!inputs.length) {
    showError(errEl, "Open the application step with the résumé upload, then tap Re-scan.");
    return;
  }

  const response = await sendToBackground({
    type: "RELAY_TO_CONTENT",
    payload: {
      type: "ATTACH_RESUME_PDF",
      selector: inputs[0].selector,
      base64Pdf: state.resumePdfBase64,
      filename: "resume-tailored.pdf",
    },
  });

  if (response?.error || !response?.ok) {
    showError(errEl, response?.error || "Attach failed.");
    return;
  }

  showSuccess($("autofill-result"), "Résumé PDF attached to the upload field.");
}

// ─── Autofill: detected questions list ───────────────────────────────────────

// ─── Template matching ────────────────────────────────────────────────────────

function normalizeQLabel(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

// Common filler words excluded from word-overlap scoring. Includes generic
// form-field nouns ("status", "information") that appear across many unrelated
// questions and must not by themselves cause a match.
const STOP_WORDS = new Set([
  "the","and","for","are","you","have","been","with","that","this",
  "from","not","was","were","will","can","your","our","their","its",
  "any","all","has","had","did","does","but","what","when","who",
  "how","why","which","would","could","should","may","might",
  "status","information","details","please","select","question","answer",
]);

// EEOC / demographic / protected-class questions. These must NEVER be matched
// by loose word-overlap — auto-selecting a protected-class answer is both wrong
// and harmful. They only match a template on a near-exact basis.
const DEMOGRAPHIC_RE =
  /\b(veteran|disabilit|disabled|gender|race|ethnic|hispanic|latino|sexual orientation|pronoun|transgender|national origin|protected|eeo|self[\s-]?identif)\w*/i;

function isDemographicQuestion(label) {
  return DEMOGRAPHIC_RE.test(label || "");
}

/**
 * Score how well a saved template (cand) matches a scraped field label (field).
 * Returns a value in [0, 1]: 0 = no match, 1 = exact match.
 */
function templateMatchScore(candNorm, fieldNorm) {
  if (!candNorm || !fieldNorm) return 0;
  if (candNorm === fieldNorm) return 1;
  // Substring containment (both must be reasonably long to be meaningful)
  if (candNorm.length >= 12 && fieldNorm.length >= 12) {
    if (candNorm.includes(fieldNorm) || fieldNorm.includes(candNorm)) return 0.95;
  }
  // Word-overlap: needs at least 2 shared meaningful words AND a high ratio,
  // so a single common word (e.g. "status") can never trigger a match.
  const words = (s) => s.split(/\s+/).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  const cw = new Set(words(candNorm));
  const fw = words(fieldNorm);
  if (cw.size === 0 || fw.length === 0) return 0;
  const overlap = fw.filter((w) => cw.has(w)).length;
  if (overlap < 2) return 0;
  const ratio = overlap / Math.min(cw.size, fw.length);
  return ratio >= 0.6 ? ratio * 0.8 : 0;
}

/** Find the best saved ApplicationAnswerDoc for a scraped field label. */
function findTemplateForQuestion(fieldLabel) {
  const allDocs = state.settings.applicationAnswerDocs || [];
  if (!allDocs.length) return null;

  // Filter templates to matching job board or global/generic templates
  const currentSite = (state.scraped?.site || "").trim().toLowerCase();
  const docs = allDocs.filter((d) => {
    const docSource = (d.source || "").trim().toLowerCase();
    if (!docSource || docSource === "other" || docSource === "generic") return true;
    if (currentSite && docSource === currentSite) return true;
    return false;
  });

  if (!docs.length) return null;
  const fieldNorm = normalizeQLabel(fieldLabel);
  if (!fieldNorm) return null;

  // Protected-class questions require a reasonable match threshold.
  const demographic = isDemographicQuestion(fieldLabel);
  const threshold = demographic ? 0.70 : 0.5;

  let bestDoc = null;
  let bestScore = 0;

  for (const d of docs) {
    const qNorm = normalizeQLabel(d.question || "");
    const tNorm = normalizeQLabel(d.title || "");
    const cand = qNorm.length >= tNorm.length ? qNorm : tNorm;
    const score = templateMatchScore(cand, fieldNorm);
    if (score > bestScore) { bestScore = score; bestDoc = d; }
  }

  const matched = bestScore >= threshold ? bestDoc : null;
  if (matched) {
    console.log(`[RO] matched "${fieldLabel}" → "${matched.title}" (score ${bestScore.toFixed(2)})`);
  } else {
    console.log(`[RO] no template match for "${fieldLabel}" (best score ${bestScore.toFixed(2)}, threshold ${threshold})`);
  }

  return matched;
}

// ─── Common-field classification (Simplify-style) ─────────────────────────────
//
// "Common" questions are standard identity/contact fields present on most
// applications — they fill straight from the synced profile, no answer bank
// needed. Everything else is a "Unique" (application-specific) question that
// relies on the Q&A template bank.

function slugifyName(name) {
  return (name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Answer for an EEOC / voluntary self-identification question, taken from the
 * user's own saved preferences. Returns null when nothing is set, so a blank
 * preference leaves the question untouched rather than guessing.
 */
function getDemographicValue(labelLower) {
  const l = labelLower;
  if (!/\b(gender|sex|race|ethnic\w*|hispanic|latin[ox]|veteran|military|disab\w*|transgender|pronouns?|sexual orientation)\b/.test(l)) {
    return null;
  }
  const d = state.settings.demographics || {};
  const pick = (v) => (v && String(v).trim() ? String(v).trim() : null);

  // Most specific first — "sexual orientation" must not fall through to "sex".
  if (/pronouns?/.test(l)) return pick(d.pronouns);
  if (/sexual orientation/.test(l)) return null;
  if (/veteran|military/.test(l)) return pick(d.veteran);
  if (/disab/.test(l)) return pick(d.disability);
  if (/\brace\b|ethnic/.test(l)) return pick(d.race);
  if (/hispanic|latin[ox]/.test(l)) return pick(d.hispanic);
  if (/gender|transgender|\bsex\b/.test(l)) return pick(d.gender);
  return null;
}

/**
 * Strip the required/optional chrome ATS forms append to a label — "Name ✱",
 * "Email *", "LinkedIn (optional)" — so short labels still match exactly.
 */
function cleanFieldLabel(label) {
  return (label || "")
    .toLowerCase()
    .replace(/\((?:required|optional)\)/g, "")
    .replace(/[*✱﹡·•:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Return the profile-derived value for a common field label, or null. */
function getCommonFieldValue(label, profile) {
  if (!profile) return null;
  const l = cleanFieldLabel(label);

  // Self-ID questions come from the user's saved preferences, not the profile.
  const demographic = getDemographicValue(l);
  if (demographic) return demographic;

  const links = profile.links || [];
  const findLink = (kw) => {
    const m = links.find(
      (x) => (x.label || "").toLowerCase().includes(kw) || (x.url || "").toLowerCase().includes(kw)
    );
    return m?.url || null;
  };
  const nameParts = (profile.name || "").trim().split(/\s+/).filter(Boolean);

  // Specific patterns first, generic last.
  if (/\b(first|given)\s*name\b/.test(l)) return nameParts[0] || null;
  if (/\b(last|family)\s*name\b|\bsurname\b/.test(l)) return nameParts.slice(1).join(" ") || null;
  if (/\bpreferred\s*name\b/.test(l)) return nameParts[0] || null;
  if (/\bfull\s*name\b|^name$|\byour name\b|\blegal name\b/.test(l)) return profile.name || null;
  if (/\be-?mail\b/.test(l)) return profile.email || null;
  if (/country/.test(l) && /phone|code/.test(l)) return null; // phone country code — skip
  if (/\bphone\b|\bmobile\b|\bcontact number\b|\btelephone\b/.test(l)) return profile.phone || null;
  if (/\blinkedin\b/.test(l)) return findLink("linkedin") || (profile.name ? `https://www.linkedin.com/in/${slugifyName(profile.name)}` : null);
  if (/\bgithub\b/.test(l)) return findLink("github");
  if (/\b(portfolio|personal website|personal site)\b/.test(l)) return findLink("portfolio") || findLink("http");
  if (/\bwebsite\b/.test(l)) return findLink("http");
  if (/\b(city|location|current location)\b/.test(l)) return profile.location || null;
  if (/\b(legally authorized|work authorization|authorized to work|eligible to work)\b/i.test(l)) return "Yes";
  if (/\b(sponsorship|require visa|require sponsorship|need sponsorship)\b/i.test(l)) return "No";
  if (/\bschool\b|\buniversity\b|\bcollege\b/.test(l)) return profile.education?.[0]?.school || null;
  if (/\bdegree\b/.test(l)) return profile.education?.[0]?.degree || null;
  if (/\bmajor\b|\bfield of study\b|\bdiscipline\b/.test(l)) return profile.education?.[0]?.major || null;
  if (/\bgraduats?ion\b|\bgrad date\b/.test(l)) return profile.education?.[0]?.end || null;
  return null;
}

// Identity/contact fields whose answer is the profile's, full stop. A saved Q&A
// template must never win here: fuzzy label matching on a two-word label like
// "Full name" is exactly where a generic answer (a LinkedIn URL, say) gets
// pulled into the wrong box.
const IDENTITY_FIELD_RE =
  /\b((first|last|full|legal|preferred|middle|given|family|your)\s*name|surname|e-?mail|phone|mobile|telephone|linkedin|github|portfolio|website)\b|^name$/i;

function isIdentityField(label) {
  return IDENTITY_FIELD_RE.test(cleanFieldLabel(label));
}

/** Resolve one field's fill value: profile for identity fields, template first otherwise. */
function resolveFieldValue(label, profile) {
  const commonVal = getCommonFieldValue(label, profile);
  const commonText = commonVal != null ? String(commonVal).trim() : "";
  if (isIdentityField(label)) return commonText || null;

  const tmpl = findTemplateForQuestion(label);
  return tmpl?.templateAnswer?.trim() || commonText || null;
}

/** Split detected fields into { common, unique } buckets. */
function classifyFields(fields) {
  const profile = state.settings.profile;
  const common = [];
  const unique = [];
  for (const f of fields) {
    const resolvedValue = resolveFieldValue(f.label, profile);
    if (resolvedValue) {
      common.push({ ...f, commonValue: resolvedValue });
    } else {
      unique.push(f);
    }
  }
  return { common, unique };
}

/** Build the fill list for selected fields (see resolveFieldValue for precedence). */
function buildEditableAnswers(fields) {
  const profile = state.settings.profile;
  return fields.flatMap((q) => {
    const text = resolveFieldValue(q.label, profile);
    return text ? [{ selector: q.selector, label: q.label, text }] : [];
  });
}

// ─── Autofill all questions ───────────────────────────────────────────────────

/**
 * Autofill ALL detected questions:
 * - questions that match a saved template → use templateAnswer directly (no AI)
 * - questions with no template → AI-generate an answer
 */
async function handleAutofillAll() {
  const errEl = $("af-error");
  const okEl = $("autofill-result");
  errEl?.classList.add("hidden");
  okEl?.classList.add("hidden");

  const allFields = state.scraped?.fields || [];
  if (!allFields.length) {
    showError(errEl, "No questions detected yet. Click Re-scan first.");
    return;
  }

  // Select all fields so handleOptimize processes all of them
  state.selectedFields = new Set(allFields.map((f) => f.selector));

  setAutofillAllBusy(true);
  try {
    await handleOptimize();

    if (!state.editableAnswers.length) {
      // Nothing fillable — offer to add answers for the unique (non-common) questions.
      const { unique } = classifyFields(allFields);
      const unmatched = unique.filter(
        (f) => !findTemplateForQuestion(f.label)?.templateAnswer?.trim()
      );
      if (unmatched.length) {
        showQaInlineForm(unmatched);
      } else {
        showSuccess(okEl, "All questions already have answers.");
      }
      return;
    }

    await handleAutofill();
  } finally {
    setAutofillAllBusy(false);
  }
}

/**
 * Show the inline form so the user can type answers for unmatched questions
 * and save them directly to the workspace Q&A templates without leaving the page.
 */
function handleAnswerNewQuestions() {
  const { unique } = classifyFields(state.scraped?.fields || []);
  // Only unique questions with no saved answer need a new template.
  const newFields = unique.filter(
    (f) => !findTemplateForQuestion(f.label)?.templateAnswer?.trim()
  );
  if (!newFields.length) return;
  showQaInlineForm(newFields);
}

function showQaInlineForm(fields) {
  const form = $("qa-new-form");
  const entries = $("qa-new-entries");
  if (!form || !entries) return;

  entries.innerHTML = "";
  fields.forEach((field, i) => {
    const div = document.createElement("div");
    div.className = "qa-entry";

    const qEl = document.createElement("div");
    qEl.className = "qa-entry-q";
    qEl.textContent = field.label || "(no label)";

    const ta = document.createElement("textarea");
    ta.className = "qa-entry-a";
    ta.placeholder = "Your answer…";
    ta.rows = 3;
    ta.dataset.label = field.label || "";
    ta.id = `qa-entry-${i}`;

    div.append(qEl, ta);
    entries.appendChild(div);
  });

  $("qa-new-error")?.classList.add("hidden");
  $("qa-new-success")?.classList.add("hidden");
  form.classList.remove("hidden");
  form.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function handleSaveQaTemplates() {
  const entries = $("qa-new-entries");
  if (!entries) return;

  const source = state.scraped?.site || "";
  const newDocs = [];
  entries.querySelectorAll("textarea.qa-entry-a").forEach((ta) => {
    const answer = ta.value.trim();
    if (!answer) return;
    const label = ta.dataset.label || "Question";
    const now = Date.now();
    newDocs.push({
      id: `aa_${crypto.randomUUID()}`,
      title: label.slice(0, 80),
      createdAt: now,
      updatedAt: now,
      question: label,
      templateAnswer: answer,
      source,
    });
  });

  if (!newDocs.length) {
    showError($("qa-new-error"), "Fill in at least one answer before saving.");
    return;
  }

  const btn = $("btn-qa-new-save");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  $("qa-new-error")?.classList.add("hidden");

  try {
    const allDocs = [...(state.settings.applicationAnswerDocs || []), ...newDocs];
    const response = await sendToBackground({
      type: "SAVE_QA_TEMPLATES",
      payload: {
        appUrl: state.settings.appUrl || "http://localhost:3000",
        applicationAnswerDocs: allDocs,
      },
    });

    if (response?.error) {
      showError($("qa-new-error"), response.error);
      return;
    }

    // Update local cache immediately
    state.settings.applicationAnswerDocs = allDocs;
    chrome.storage.local.set({ applicationAnswerDocs: allDocs }).catch(() => {});

    showSuccess(
      $("qa-new-success"),
      `${newDocs.length} template${newDocs.length === 1 ? "" : "s"} saved.`
    );
    setTimeout(() => {
      $("qa-new-form")?.classList.add("hidden");
      renderAutofillQuestions(state.scraped?.fields || []);
    }, 1200);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Save to Q&A templates"; }
  }
}

function setAutofillAllBusy(busy) {
  const btn = $("btn-autofill-all-questions");
  if (!btn) return;
  btn.disabled = busy;
  btn.textContent = busy ? "Generating answers…" : "Autofill all answers";
}


// ─── Keyword scoring helpers ───────────────

function profileToText(profile) {
  try {
    const parts = [];
    if (profile?.name) parts.push(profile.name);
    if (Array.isArray(profile?.skills)) parts.push(profile.skills.join(" "));
    if (Array.isArray(profile?.skillCategories)) {
      parts.push(profile.skillCategories.flatMap((c) => c.items || []).join(" "));
    }
    if (Array.isArray(profile?.experience)) {
      for (const e of profile.experience) {
        parts.push([e.company, e.title, ...(e.bullets || [])].filter(Boolean).join(" "));
      }
    }
    if (Array.isArray(profile?.projects)) {
      for (const p of profile.projects) {
        parts.push([p.name, p.role, ...(p.tech || []), ...(p.bullets || [])].filter(Boolean).join(" "));
      }
    }
    return parts.join("\n");
  } catch {
    return JSON.stringify(profile);
  }
}

function profileHas(profileTextLower, keyword) {
  const k = keyword.toLowerCase();
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  try {
    const re = new RegExp(`(^|[^a-z0-9+#])${esc}($|[^a-z0-9+#])`, "i");
    return re.test(profileTextLower);
  } catch {
    return profileTextLower.includes(k);
  }
}

// Heuristic keywords: inclusion-only extraction lives in app/lib/jd-keyword-extract.ts
// and is served at POST /api/jd/extract-keywords (see fetchDeterministicKeywords).

// ─── Helpers ─────────────────────────────────────────────────────────────────

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

function setHtml(id, html) {
  const el = $(id);
  if (el) el.innerHTML = html;
}

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Escapes `text` then wraps metrics/numbers in <strong class="bullet-metric">.
// Highlights: **markdown bold**, currency ($2M), percentages (50%), multipliers (3x),
// K/M/B-suffixed numbers, time values (50ms, 2s), comma-formatted numbers,
// and numbers followed by impact nouns (10 engineers, 3 teams).
function bulletHtml(text) {
  const METRIC_RE = /\*\*(.+?)\*\*|\$[\d,.]+[KMBkm]?\b|\b\d+(?:[,.]\d+)*(?:\+?%|[xX]\b|\+(?!\d)|\+?[KMBkm]\b|\s*ms\b|\s*s\b|\s*min\b|\s*hrs?\b|\s*hours?\b|\s*days?\b|\s*weeks?\b|\s*months?\b|\s*years?\b|\s+(?:users?|customers?|clients?|engineers?|developers?|teams?|services?|microservices?|features?|requests?|repos?|endpoints?|deployments?|countries?|markets?|applications?)\b)|(?:\d{1,3})(?:,\d{3})+(?:\.\d+)?\b/g;
  const s = String(text ?? "");
  let html = "";
  let last = 0;
  let m;
  while ((m = METRIC_RE.exec(s)) !== null) {
    html += esc(s.slice(last, m.index));
    const display = m[1] ?? m[0]; // m[1] = inner text of **bold**, otherwise full match
    html += `<strong class="bullet-metric">${esc(display)}</strong>`;
    last = m.index + m[0].length;
  }
  html += esc(s.slice(last));
  return html;
}

function showError(el, msg) {
  if (!el) { console.warn(msg); return; }
  el.textContent = msg;
  el.classList.remove("hidden");
}

function showSuccess(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
}

function sendToBackground(message) {
  return new Promise((resolve) => {
    try {
      if (!chrome?.runtime?.id) {
        resolve({ error: "Extension reloaded. Close the overlay and open it again." });
        return;
      }
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ error: chrome.runtime.lastError.message });
        } else {
          resolve(response);
        }
      });
    } catch (e) {
      const msg = String(e?.message || e || "");
      resolve({
        error: msg.includes("Extension context invalidated")
          ? "Extension reloaded. Close the overlay and open it again."
          : msg || "Failed to reach extension background.",
      });
    }
  });
}

// ─── Boot ────────────────────────────────────────────────────────────────────

init().catch(console.error);
