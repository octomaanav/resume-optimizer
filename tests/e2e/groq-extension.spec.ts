import { test, expect, chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { PDFDocument } from "pdf-lib";
import { extractJdKeywordsDeterministic } from "../../app/lib/jd-keyword-extract";

type ExtensionChrome = {
  tabs: { query(query: { active: boolean; currentWindow: boolean }): Promise<Array<{ id: number }>>;
    sendMessage(id: number, message: { type: string }): Promise<unknown> };
  storage: { local: { get(keys: string[]): Promise<{ profile?: { name: string }; aiProvider?: string }> } };
};

// Requires a real server-side GROQ_API_KEY; no API responses are mocked.
test("Groq: complete CS profile, real extension autofill, tailored PDF and ATS checks", async () => {
  test.skip(process.env.GROQ_E2E !== "1", "Opt in with GROQ_E2E=1 and a configured server key");
  test.setTimeout(600_000);
  const baseURL = process.env.E2E_BASE_URL || "http://localhost:3000";
  const extension = path.resolve("chrome-extension");
  const out = path.resolve(process.env.GROQ_AUDIT_OUT || "artifacts/groq-audit");
  fs.mkdirSync(out, { recursive: true });
  const profile = JSON.parse(fs.readFileSync(process.env.GROQ_PROFILE_FIXTURE || "tests/fixtures/cs-candidate.json", "utf8"));
  const jd = fs.readFileSync("tests/fixtures/software-engineer-jd.txt", "utf8");
  const report: Record<string, unknown> = { provider: "groq", model: "openai/gpt-oss-120b", steps: [] };
  const log = (step: string, details: unknown) => { (report.steps as unknown[]).push({ step, details }); fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(report, null, 2)); console.log(step, JSON.stringify(details)); };
  const context = await chromium.launchPersistentContext(test.info().outputPath("extension-profile"), {
    channel: "chromium", headless: true, viewport: { width: 1440, height: 1100 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const api = context.request;
    const email = "groq-extension-cs@example.com";
    const password = "SyntheticAuditPassword123!";
    const registered = await api.post(baseURL + "/api/auth/register", { data: { name: "Groq Synthetic Audit", email, password } });
    expect([201, 409]).toContain(registered.status());
    const csrf = await (await api.get(baseURL + "/api/auth/csrf")).json();
    await api.post(baseURL + "/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, email, password }, headers: { "X-Auth-Return-Redirect": "1" } });
    expect((await (await api.get(baseURL + "/api/auth/session")).json()).user).toBeTruthy();
    expect((await api.put(baseURL + "/api/database/profiles/me", { data: profile })).ok()).toBeTruthy();
    const preferences = [
      ["Are you legally authorized to work in the United States?", "Yes"],
      ["Will you require sponsorship now or in the future?", "No"],
      ["Are you willing to relocate?", "Yes"],
      ["I agree to the privacy policy", "Yes"],
    ].map(([question, templateAnswer], i) => ({ id: `preference-${i}`, title: question, question, templateAnswer, source: "", createdAt: Date.now(), updatedAt: Date.now() }));
    expect((await api.put(baseURL + "/api/database/workspace/me", { data: {
      settings: { aiProvider: "groq", groqModel: "openai/gpt-oss-120b", skillsMd: "Use concrete facts. Do not invent metrics or tools. Avoid leveraged, spearheaded and passionate about.", personalContext: "I want to build developer tools that make debugging easier. I care about reliable systems and accessible interfaces." },
      applicationAnswerDocs: preferences,
    }})).ok()).toBeTruthy();
    const app = await context.newPage();
    await app.goto(baseURL + "/profile");
    await expect(app.getByLabel("Name", { exact: true })).toHaveValue(profile.name);
    await expect(app.getByLabel("School", { exact: true })).toHaveValue(profile.education[0].school);
    await expect(app.locator("textarea").first()).toHaveValue(profile.summary);
    await app.locator("textarea").first().fill(profile.summary + " Comfortable explaining technical tradeoffs.");
    await app.getByRole("button", { name: "Save", exact: true }).first().click();
    await expect.poll(async () => (await (await api.get(baseURL + "/api/database/profiles/me")).json()).profile.summary).toContain("technical tradeoffs");
    const storedProfile = (await (await api.get(baseURL + "/api/database/profiles/me")).json()).profile;
    expect(storedProfile.experience).toHaveLength(profile.experience.length); expect(storedProfile.projects).toHaveLength(profile.projects.length); expect(storedProfile.links).toHaveLength(3);
    log("profile persisted and verified in UI", { education: 1, experience: profile.experience.length, projects: profile.projects.length, skillGroups: 4, links: 3 });
    await app.screenshot({ path: path.join(out, "profile.png"), fullPage: true });
    await app.goto(baseURL + "/settings");
    await expect(app.getByRole("radio", { name: /^Groq/ })).toHaveAttribute("aria-checked", "true");
    const baseline = await api.post(baseURL + "/api/extension/resume-pdf", { data: { profile: storedProfile, subsetEnabled: true, selectedExperienceIds: storedProfile.experience.slice(0, 4).map((e: { id: string }) => e.id), selectedProjectIds: storedProfile.projects.slice(0, 2).map((p: { id: string }) => p.id) } });
    expect(baseline.status(), await baseline.text().then(t => t.slice(0, 100))).toBe(200);
    fs.writeFileSync(path.join(out, "baseline.pdf"), await baseline.body());
    const workers = context.serviceWorkers();
    const worker = workers[0] || await context.waitForEvent("serviceworker");
    const extensionId = worker.url().split("/")[2];
    log("real extension loaded", { extensionId });
    const application = await context.newPage();
    const applicationURL = baseURL + "/e2e-fake-application";
    await context.route(applicationURL, route => route.fulfill({ contentType: "text/html", body: fs.readFileSync("tests/fixtures/application.html", "utf8").replace("__JD__", jd) }));
    await application.goto(applicationURL);
    await application.bringToFront();
    const detected = await worker.evaluate(async () => {
      const chrome = (globalThis as unknown as { chrome: ExtensionChrome }).chrome;
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return await chrome.tabs.sendMessage(tabs[0].id, { type: "SCRAPE" });
    });
    fs.writeFileSync(path.join(out, "scrape.json"), JSON.stringify(detected, null, 2));
    log("content script detected fields", { count: (detected as { fields: unknown[] }).fields.length });
    expect((detected as { fields: unknown[] }).fields.length).toBeGreaterThan(20);
    await worker.evaluate(async () => {
      const chrome = (globalThis as unknown as { chrome: ExtensionChrome }).chrome;
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tabs[0].id, { type: "TOGGLE_OVERLAY" });
    });
    const frame = application.frameLocator(`iframe[src^="chrome-extension://${extensionId}/"]`);
    await expect(frame.locator("#btn-hero-autofill")).toBeVisible();
    await expect.poll(async () => worker.evaluate(async () => {
      const chrome = (globalThis as unknown as { chrome: ExtensionChrome }).chrome;
      const data = await chrome.storage.local.get(["profile", "aiProvider"]);
      return { name: data.profile?.name, provider: data.aiProvider };
    })).toEqual({ name: "Jordan Patel", provider: "groq" });
    log("extension synced authenticated profile and Groq", { name: "Jordan Patel", provider: "groq" });
    await frame.locator("#btn-hero-autofill").click();
    await expect.poll(async () => {
      if (await frame.locator("#af-error").isVisible()) throw new Error(await frame.locator("#af-error").innerText());
      return application.locator("#why").inputValue();
    }, { timeout: 180_000 }).not.toBe("");
    await expect(frame.locator("#btn-hero-autofill")).toBeEnabled({ timeout: 180_000 });
    const expected: Record<string, string> = { first: "Jordan", last: "Patel", email: profile.email, phone: profile.phone, city: "Boston", state: "Massachusetts", country: "US", linkedin: profile.links[0].url, github: profile.links[1].url, portfolio: profile.links[2].url, school: profile.education[0].school, degree: profile.education[0].degree, major: "Computer Science", grad: "2026", gpa: "3.80", company: profile.experience[0].company, jobtitle: profile.experience[0].title, authorized: "yes", sponsorship: "no", relocate: "yes" };
    const values: Record<string, string> = {};
    for (const [id, value] of Object.entries(expected)) { await expect(application.locator("#" + id), id).toHaveValue(value); values[id] = await application.locator("#" + id).inputValue(); }
    for (const [id, max] of [["why", 500], ["challenge", 800]] as const) { const value = await application.locator("#" + id).inputValue(); expect(value.length).toBeGreaterThan(30); expect(value.length).toBeLessThanOrEqual(max); values[id] = value; }
    expect(values.challenge).not.toMatch(/\bTTL\b|invalidat/i);
    expect(values.why).not.toMatch(/(?:internship|worked|work|employment) (?:here|at your company)/i);
    await expect(application.locator("#privacy")).toBeChecked();
    expect(await application.evaluate(() => (window as unknown as { submissions: number }).submissions)).toBe(0);
    log("autofill reviewed", values);
    await frame.locator("#btn-optimize-resume-ext").click();
    await expect.poll(async () => {
      if (await frame.locator("#af-error").isVisible()) throw new Error(await frame.locator("#af-error").innerText());
      return frame.locator("#ro-resume-panel").isVisible();
    }, { timeout: 240_000 }).toBe(true);
    const sidebar = application.frames().find(f => f.url().startsWith(`chrome-extension://${extensionId}/`));
    const generation = await sidebar!.evaluate("JSON.parse(JSON.stringify(state.lastResumeOptimize))") as { experienceBulletsById: Record<string, string[]>; projectBulletsById: Record<string, string[]>; metricWarnings?: unknown[]; exportStats?: { pages?: number; bulletsDropped?: number } };
    fs.writeFileSync(path.join(out, "generation.json"), JSON.stringify(generation, null, 2));
    if (generation.exportStats?.bulletsDropped) await expect(frame.locator("#ro-resume-badge")).toContainText("omitted to fit one page");
    await frame.locator("#btn-attach-tailored-resume").click();
    await expect.poll(async () => application.locator("#resume").evaluate((el: HTMLInputElement) => el.files?.length || 0)).toBe(1);
    const uploaded = await application.locator("#resume").evaluate(async (el: HTMLInputElement) => ({ name: el.files![0].name, bytes: Array.from(new Uint8Array(await el.files![0].arrayBuffer())) }));
    fs.writeFileSync(path.join(out, "tailored.pdf"), Buffer.from(uploaded.bytes));
    const pdf = await PDFDocument.load(Uint8Array.from(uploaded.bytes)); expect(pdf.getPageCount()).toBe(1);
    expect(await application.locator("form").evaluate((form: HTMLFormElement) => form.checkValidity())).toBe(true);
    expect(await application.evaluate(() => (window as unknown as { submissions: number }).submissions)).toBe(0);
    await application.screenshot({ path: path.join(out, "filled-application.png"), fullPage: true });
    for (const name of ["baseline", "tailored"]) execFileSync("pdftotext", ["-layout", path.join(out, name + ".pdf"), path.join(out, name + ".txt")]);
    const text = fs.readFileSync(path.join(out, "tailored.txt"), "utf8");
    const canonical = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const pdfText = canonical(text);
    expect(text).not.toMatch(/\d+(?:\.\d+)?%/); // This candidate supplied no percentage metrics.
    const maps = [generation.experienceBulletsById, generation.projectBulletsById] as Array<Record<string, string[]>>;
    const bulletChecks = maps.flatMap(map => Object.values(map).flat()).map(bullet => {
      const content = canonical(bullet);
      const retained = pdfText.includes(content.slice(0, 45));
      if (retained) expect(pdfText, `Retained bullet must not lose its ending: ${bullet}`).toContain(content);
      return { bullet, retained };
    });
    report.pdfBulletChecks = bulletChecks;
    expect(text).toContain("Jordan Patel"); expect(text).toContain(profile.email); expect(text).toMatch(/Education/); expect(text).toMatch(/Experience/); expect(text).not.toMatch(/Kubernetes|\bGo\b/);
    const required = ["TypeScript", "Node.js", "React", "REST API", "PostgreSQL", "Redis", "Docker", "AWS", "GitHub Actions", "CI/CD", "OpenTelemetry", "Playwright", "integration tests", "accessible"];
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
    const score = (name: string) => { const t = normalize(fs.readFileSync(path.join(out, name + ".txt"), "utf8")); const matched = required.filter(k => t.includes(normalize(k))); return { score: Math.round(100 * matched.length / required.length), matched, missing: required.filter(k => !matched.includes(k)) }; };
    const before = score("baseline"), after = score("tailored");
    report.ats = { methodology: "Local required-keyword coverage percentage in extracted PDF text; not a commercial ATS score", before, after, pages: pdf.getPageCount(), extractedJdKeywords: extractJdKeywordsDeterministic(jd) };
    expect(after.score).toBeGreaterThanOrEqual(before.score);
    expect(after.score).toBeGreaterThanOrEqual(85);
    log("tailored PDF attached; required fields valid; never submitted", { filename: uploaded.name, pages: 1, before, after });
    fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(report, null, 2));
  } finally { await context.close(); }
});

test("Fresh extension never fills a sample identity or assumes legal consent", async () => {
  test.skip(process.env.GROQ_E2E !== "1", "Opt in to installed-extension checks with GROQ_E2E=1");
  test.setTimeout(60_000);
  const extension = path.resolve("chrome-extension");
  const context = await chromium.launchPersistentContext(test.info().outputPath("fresh-extension"), {
    channel: "chromium", headless: true, viewport: { width: 1440, height: 1000 },
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
    const extensionId = worker.url().split("/")[2];
    const page = await context.newPage();
    const url = "http://localhost:3000/e2e-fresh-extension";
    await context.route(url, route => route.fulfill({ contentType: "text/html", body: fs.readFileSync("tests/fixtures/application.html", "utf8").replace("__JD__", "Synthetic developer role") }));
    await page.goto(url); await page.bringToFront();
    await worker.evaluate(async () => {
      const chrome = (globalThis as unknown as { chrome: ExtensionChrome }).chrome;
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tabs[0].id, { type: "TOGGLE_OVERLAY" });
    });
    const frame = page.frameLocator(`iframe[src^="chrome-extension://${extensionId}/"]`);
    await expect(frame.locator("#btn-hero-autofill")).toBeVisible();
    await frame.locator("#btn-hero-autofill").click();
    await expect(frame.locator("#af-error")).toContainText(/profile.*sync/i);
    await expect(page.locator("#first")).toHaveValue("");
    await expect(page.locator("#authorized")).toHaveValue("");
    await expect(page.locator("#sponsorship")).toHaveValue("");
    await expect(page.locator("#privacy")).not.toBeChecked();
    expect(await page.evaluate(() => (window as unknown as { submissions: number }).submissions)).toBe(0);
  } finally { await context.close(); }
});
