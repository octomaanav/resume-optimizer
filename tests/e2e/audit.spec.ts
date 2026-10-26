import { test, expect, request, type APIRequestContext, type BrowserContext } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { parseAiOutput } from "../../app/lib/ai-output-schema";

// All provider responses below are fixtures, not real model inference.
test.describe.configure({ mode: "serial" });
let api: APIRequestContext;
let cookies: Awaited<ReturnType<BrowserContext["cookies"]>>;
let server: Server;
let providerUrl: string;
let malformed = false;
let outputOverride: Record<string, unknown> | null = null;
let resumeId: string;
const now = Date.now();
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const profile = {
  name: "Zoë 测试 🚀", location: "Montréal, QC", email: "audit@example.com",
  experience: Array.from({ length: 18 }, (_, i) => ({
    id: `e${i}`, title: `Engineer ${i}`, company: `Company ${i}`,
    start: "2020-01", end: `${2021 + i}-01`,
    bullets: [i === 0 ? "Long bullet " + "performance & reliability ".repeat(300) : `Built services ${i}`],
  })),
  projects: Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `Project ${i}`, tech: ["React"], bullets: ["Shipped accessible UI"] })),
  education: [], skills: ["TypeScript"],
};
async function workspace() {
  const res = await api.get("/api/database/workspace/me");
  expect(res.ok()).toBeTruthy();
  return (await res.json()).workspace;
}
async function patch(data: unknown) {
  const res = await api.put("/api/database/workspace/me", { data });
  expect(res.ok(), await res.text()).toBeTruthy();
}
function resultFor(prompt: string) {
  if (prompt.includes('"optimizedBullet"')) return { optimizedBullet: "Built reliable TypeScript services for production teams." };
  if (prompt.includes('"optimizedAnswer"')) return { optimizedAnswer: "I want to build accessible software with your team." };
  if (prompt.includes('"experienceBulletsById"')) return { experienceBulletsById: { e2: ["Developed services 2"] }, projectBulletsById: { p3: ["Delivered accessible interfaces."] } };
  if (prompt.includes('"companyName"')) return { title: "Letter", companyName: "Acme", outputMarkdown: "Dear Acme team, I build accessible TypeScript services." };
  return { title: "Resume", selectedExperienceIds: ["e2"], selectedProjectIds: ["p3"], outputMarkdown: "# Tailored resume" };
}
test.beforeAll(async () => {
  api = await request.newContext({ baseURL });
  const email = `e2e-${now}@example.com`;
  const registered = await api.post("/api/auth/register", { data: { name: "E2E regression", email, password: "AuditPassword123!" } });
  expect(registered.ok(), await registered.text()).toBeTruthy();
  const csrf = await (await api.get("/api/auth/csrf")).json();
  await api.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken, email, password: "AuditPassword123!" }, headers: { "X-Auth-Return-Redirect": "1" } });
  expect((await (await api.get("/api/auth/session")).json()).user).toBeTruthy();
  cookies = (await api.storageState()).cookies;
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const input = JSON.parse(body);
      const result = malformed ? {} : outputOverride ?? resultFor(input.messages?.[0]?.content ?? input.prompt ?? "");
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ message: { content: `<think>Planning</think>\n\u0060\u0060\u0060json\n${JSON.stringify(result)}\n\u0060\u0060\u0060` } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture failed to start");
  providerUrl = `http://127.0.0.1:${address.port}`;
  expect((await api.put("/api/database/profiles/me", { data: profile })).ok()).toBeTruthy();
  await patch({ settings: { aiProvider: "ollama", ollamaBaseUrl: providerUrl, ollamaModel: "audit-fixture" } });
});
test.beforeEach(async ({ context }) => { await context.addCookies(cookies); });
test.afterAll(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await api?.dispose();
});

test("01 large Unicode profile persists and renders", async ({ page }) => {
  const p = (await (await api.get("/api/database/profiles/me")).json()).profile;
  expect(p.experience).toHaveLength(18);
  expect(p.name).toBe(profile.name);
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Profile", exact: true })).toBeVisible();
});
test("02 partial selection saves and reloads", async ({ page }) => {
  await page.goto("/resumes/new");
  await page.locator('input:not([type]),input[type=text]').first().fill("E2E subset");
  await page.getByRole("button", { name: "Create resume", exact: true }).click();
  await page.waitForURL(/\/resumes\/(?!new)[^/]+$/);
  resumeId = page.url().split("/").at(-1)!;
  await page.getByLabel("Pick from profile (strict selection)").check();
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await page.getByLabel("Engineer 2 · Company 2", { exact: true }).check();
  await page.getByLabel("Project 3", { exact: true }).check();
  await page.getByRole("button", { name: "Save profile selection", exact: true }).click();
  await expect.poll(async () => (await workspace()).resumes[0].defaults.experienceIds).toEqual(["e2"]);
  await page.reload();
  await expect(page.getByLabel("Engineer 2 · Company 2", { exact: true })).toBeChecked();
});
test("03 customize changes only this resume and its TeX", async ({ page }) => {
  await page.goto(`/resumes/${resumeId}`);
  await page.getByRole("button", { name: "Customize", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).first().fill("Resume Specific Name");
  await page.getByLabel("Location", { exact: true }).first().fill("Boston, MA");
  await page.getByRole("button", { name: "Save resume customizations", exact: true }).click();
  await expect.poll(async () => (await workspace()).resumes[0].overrides?.profileHeader?.name).toBe("Resume Specific Name");
  expect((await (await api.get("/api/database/profiles/me")).json()).profile.name).toBe(profile.name);
  await page.getByRole("button", { name: "LaTeX", exact: true }).click();
  await expect(page.locator("textarea")).toHaveValue(/Boston, MA/);
  await expect(page.locator("textarea")).not.toHaveValue(/Company 1/);
});
test("04 custom LaTeX compiles and restores generated mode", async ({ page }) => {
  await page.goto(`/resumes/${resumeId}`);
  await page.getByRole("button", { name: "LaTeX", exact: true }).click();
  await page.getByRole("button", { name: "Custom (full document)", exact: true }).click();
  const tex = String.raw`\documentclass{article}\begin{document}Audit custom document\end{document}`;
  await page.locator("textarea").fill(tex);
  await page.getByRole("button", { name: "Save custom LaTeX", exact: true }).click();
  await expect.poll(async () => (await workspace()).resumes[0].customLatex).toBe(tex);
  await page.reload();
  await page.getByRole("button", { name: "LaTeX", exact: true }).click();
  await expect(page.locator("textarea")).toHaveValue(tex);
  await page.getByRole("button", { name: "Compile preview (PDF)", exact: true }).click();
  await expect(page.getByTitle("LaTeX PDF preview")).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Use generated again", exact: true }).click();
  await expect.poll(async () => (await workspace()).resumes[0].latexMode).toBe("generated");
});
test("05 legacy Markdown is read-only and large JD renders", async ({ page }) => {
  const w = await workspace();
  w.resumes[0].outputMarkdown = "# Legacy café 测试 🚀";
  w.resumes[0].jd = "TypeScript Postgres engineer ".repeat(1500).trim();
  await patch({ resumes: w.resumes });
  await page.goto(`/resumes/${resumeId}`);
  await page.getByRole("button", { name: "(Legacy) Markdown", exact: true }).click();
  await expect(page.locator("textarea")).toHaveValue(w.resumes[0].outputMarkdown);
  await expect(page.locator("textarea")).toHaveAttribute("readonly", "");
  await expect(page.getByText(w.resumes[0].jd, { exact: true })).toBeVisible();
});
test("06 settings upload, labels and keyboard radios", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("skills.md", { exact: true }).waitFor();
  await page.getByLabel('Upload a .md file').setInputFiles({ name: "skills.md", mimeType: "text/markdown", buffer: Buffer.from("- TypeScript\n- Accessibility") });
  await page.getByLabel("Personal context", { exact: true }).fill("I care about accessibility. 测试 🚀");
  const gemini = page.getByRole("radio", { name: /Google Gemini/ });
  await gemini.click(); await gemini.focus(); await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("radio", { name: /^Groq/ })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("End");
  await expect(page.getByRole("radio", { name: /Ollama/ })).toHaveAttribute("aria-checked", "true");
  const theme = page.getByRole("radiogroup", { name: "Color theme" });
  await theme.getByRole("radio", { name: "Light", exact: true }).click();
  await page.keyboard.press("ArrowRight");
  await expect(theme.getByRole("radio", { name: "System", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.getByLabel('Upload a .md file').focus();
  await expect(page.getByLabel('Upload a .md file')).toBeFocused();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await workspace()).settings.personalContext).toContain("测试");
  await page.reload();
  await expect(page.getByLabel("skills.md", { exact: true })).toHaveValue("- TypeScript\n- Accessibility");
});
test("07 unavailable Ollama has an actionable error", async () => {
  const res = await api.post("/api/ai/generate", { headers: { "x-ai-provider": "ollama", "x-ollama-base-url": "http://127.0.0.1:1" }, data: { kind: "profileBullet", profileBulletDraft: "Built services", profile } });
  expect(res.status()).toBe(502);
  expect(await res.text()).toContain("Cannot reach Ollama");
});
test("08 malformed model JSON is rejected for every generation kind", async () => {
  malformed = true;
  try {
    for (const input of [{ kind: "profileBullet", profileBulletDraft: "Built services" }, { kind: "applicationAnswer", applicationQuestion: "Why us?" }, { kind: "coverLetter" }, { kind: "resume", mode: "select" }, { kind: "resume", mode: "bullets" }]) {
      const res = await api.post("/api/ai/generate", { headers: { "x-ai-provider": "ollama", "x-ollama-base-url": providerUrl }, data: { ...input, profile } });
      expect(res.status()).toBe(502);
    }
  } finally { malformed = false; }
  expect(() => parseAiOutput({ optimizedBullet: 123 }, { kind: "profileBullet", mode: "select", selectBest: false })).toThrow();
});
test("09 XYZ rewrite accepts, traps focus and persists", async ({ page }) => {
  await page.goto("/profile");
  await page.getByRole("button", { name: "XYZ optimize", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close", exact: true })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Accept", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Accept", exact: true }).click();
  await expect.poll(async () => JSON.stringify((await (await api.get("/api/database/profiles/me")).json()).profile.experience)).toContain("Built reliable TypeScript services for production teams.");
});
test("10 cover letter generation persists without changing template", async ({ page }) => {
  await patch({ coverLetters: [{ id: "audit-cover", title: "Audit cover", createdAt: now, updatedAt: now, templateMarkdown: "Dear team" }] });
  await page.goto("/optimize/cover-letter?baseId=audit-cover");
  await page.getByLabel("Job description", { exact: true }).fill("Acme engineer " + "TypeScript Postgres ".repeat(2000));
  await page.getByRole("button", { name: "Optimize", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Accept", exact: true }).click();
  await expect.poll(async () => (await workspace()).coverLetterOptimizations["audit-cover"]?.outputMarkdown).toContain("Dear Acme team");
  expect((await workspace()).coverLetters[0].templateMarkdown).toBe("Dear team");
});
test("11 Q&A generation persists and Escape closes dialog", async ({ page }) => {
  await patch({ applicationAnswerDocs: [{ id: "audit-answer", title: "Audit answer", question: "Why Acme?", templateAnswer: "I build services.", createdAt: now, updatedAt: now }] });
  await page.goto("/optimize/application-question?baseId=audit-answer");
  await page.getByLabel("Job description", { exact: true }).fill("Acme needs a TypeScript engineer.");
  await page.getByRole("button", { name: "Tailor to JD", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(async () => (await workspace()).applicationAnswerOptimizations["audit-answer"]?.tailoredAnswer).toContain("accessible software");
});
test("12 resume selection and bullet optimization persist", async ({ page }) => {
  await page.goto(`/optimize/resume?baseId=${resumeId}`);
  await page.getByPlaceholder("Paste the JD…").fill("Acme needs TypeScript engineers " + "React Postgres ".repeat(2000));
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Optimize bullets", exact: true }).click();
  await expect.poll(async () => (await workspace()).resumeOptimizations[resumeId]?.experienceBulletsById.e2).toEqual(["Developed services 2"]);
  expect((await workspace()).resumes[0].outputMarkdown).toBe("# Legacy café 测试 🚀");
});
test("13 mobile dock and page widths stay within 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  for (const path of ["/", "/profile", "/documents", "/resumes", "/cover-letters", "/application-questions", "/optimize", "/optimize/resume", "/optimize/cover-letter", "/optimize/application-question", "/settings", "/resumes/new", "/cover-letters/new", "/application-questions/new", "/cover-letters/audit-cover", "/application-questions/audit-answer", "/login", "/signup", `/resumes/${resumeId}`]) {
    await page.goto(path);
    const nav = page.getByRole("navigation", { name: "Main navigation" });
    await expect(nav).toBeVisible();
    const box = await nav.boundingBox();
    expect(box!.x, path).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width, path).toBeLessThanOrEqual(320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(320);
  }
});
test("14 concurrent patches preserve both changes and invalid sessions fail", async ({ browser }) => {
  const w = await workspace();
  const responses = await Promise.all([
    api.put("/api/database/workspace/me", { data: { settings: { ...w.settings, personalContext: "Concurrent edit" } } }),
    api.put("/api/database/workspace/me", { data: { applicationAnswerDocs: w.applicationAnswerDocs } }),
  ]);
  expect(responses.every(r => r.ok())).toBeTruthy();
  expect((await workspace()).settings.personalContext).toBe("Concurrent edit");
  expect((await workspace()).applicationAnswerDocs).toEqual(w.applicationAnswerDocs);
  const guest = await browser.newContext({ baseURL });
  try {
    await guest.addCookies([{ name: "authjs.session-token", value: await (await import("next-auth/jwt")).encode({ secret: process.env.AUTH_SECRET!, salt: "authjs.session-token", token: { sub: (await (await api.get("/api/auth/session")).json()).user.id }, maxAge: -3600 }), domain: "localhost", path: "/" }]);
    expect((await guest.request.get("/api/database/workspace/me")).status()).toBe(401);
    const page = await guest.newPage(); await page.goto("/profile");
    await expect(page).toHaveURL(/\/login/);
  } finally { await guest.close(); }
});
test("15 expired session during settings save shows an error", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Personal context", { exact: true }).fill("Unsaved edit");
  await page.route("**/api/database/workspace/me", async (route) => {
    if (route.request().method() === "PUT") await route.fulfill({ status: 401, json: { error: "Unauthorized" } });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("main").getByRole("alert").filter({ hasText: /sign in|unauthorized/i })).toContainText(/sign in|unauthorized/i);
  await expect(page.getByText(/^Saved /)).toHaveCount(0);
});
test("16 strict empty selection and date order survive profile reordering", async ({ page }) => {
  const p = (await (await api.get("/api/database/profiles/me")).json()).profile;
  p.experience.reverse();
  expect((await api.put("/api/database/profiles/me", { data: p })).ok()).toBeTruthy();
  await page.goto(`/resumes/${resumeId}`);
  await page.getByLabel("Engineer 17 · Company 17", { exact: true }).check();
  await page.getByRole("button", { name: "Save profile selection", exact: true }).click();
  await expect.poll(async () => (await workspace()).resumes[0].defaults.experienceIds.length).toBe(2);
  await page.getByRole("button", { name: "LaTeX", exact: true }).click();
  const tex = await page.locator("textarea").inputValue();
  expect(tex.indexOf("Company 17")).toBeLessThan(tex.indexOf("Company 2"));
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await page.getByRole("button", { name: "Save profile selection", exact: true }).click();
  await expect.poll(async () => (await workspace()).resumes[0].defaults.experienceIds).toEqual([]);
  await expect(page.locator("textarea")).not.toHaveValue(/Company \d|Project \d/);
  await page.reload();
  await page.getByRole("button", { name: "LaTeX", exact: true }).click();
  await expect(page.locator("textarea")).not.toHaveValue(/Company \d|Project \d/);
});
test("17 another tab's changes refresh when this tab becomes visible", async ({ page, context }) => {
  await page.goto("/settings");
  await page.getByLabel("Personal context", { exact: true }).waitFor();
  const other = await context.newPage();
  try {
    await other.goto("/settings");
    await other.getByLabel("Personal context", { exact: true }).fill("Second tab edit");
    await other.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => (await workspace()).settings.personalContext).toBe("Second tab edit");
    await page.bringToFront();
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByLabel("Personal context", { exact: true })).toHaveValue("Second tab edit");
  } finally { await other.close(); }
});
test("18 AI errors reject malformed requests and typed output", async () => {
  const cases = [null, {}, { kind: "profileBullet", profile, profileBulletDraft: " " }, { kind: "applicationAnswer", profile, applicationQuestion: " " }];
  for (const data of cases) {
    const res = await api.post("/api/ai/generate", { data });
    expect(res.status()).toBe(400);
  }
  for (const value of [{ optimizedBullet: 123 }, { optimizedBullet: " " }, { optimizedBullet: [] }]) {
    expect(() => parseAiOutput(value, { kind: "profileBullet", mode: "select", selectBest: false })).toThrow();
  }
  expect(() => parseAiOutput({ experienceBulletsById: { e2: [42] }, projectBulletsById: {} }, { kind: "resume", mode: "bullets", selectBest: false })).toThrow();
});
test("19 selection Markdown uses profile facts and rejects unknown IDs", async () => {
  const headers = { "x-ai-provider": "ollama", "x-ollama-base-url": providerUrl };
  try {
    outputOverride = { selectedExperienceIds: ["e0", "e0"], selectedProjectIds: [], outputMarkdown: "Invented employment in 1999 https://fabricated.invalid", title: "Resume" };
    const res = await api.post("/api/ai/generate", { headers, data: { kind: "resume", mode: "select", profile } });
    expect(res.status()).toBe(200);
    const result = await res.json();
    expect(result.selectedExperienceIds).toHaveLength(4);
    expect(result.selectedExperienceIds[0]).toBe("e0");
    expect(result.selectedProjectIds).toHaveLength(2);
    expect(result.outputMarkdown).toContain("Company 0");
    expect(result.outputMarkdown).not.toMatch(/1999|fabricated/);
    outputOverride = { ...outputOverride, selectedExperienceIds: ["nonexistent"] };
    expect((await api.post("/api/ai/generate", { headers, data: { kind: "resume", profile } })).status()).toBe(502);
    outputOverride = { experienceBulletsById: { e0: ["Improved performance by 40%."] }, projectBulletsById: {} };
    const guarded = await api.post("/api/ai/generate", { headers, data: { kind: "resume", mode: "bullets", selectedExperienceIds: ["e0"], profile } });
    expect(guarded.status()).toBe(200);
    const guardedJson = await guarded.json();
    expect(guardedJson.experienceBulletsById.e0[0]).toBe(profile.experience[0].bullets[0]);
    expect(guardedJson.metricWarnings).toHaveLength(1);
  } finally { outputOverride = null; }
});

// Opt in to actual inference separately from deterministic fixture regressions.
for (const [label, input] of [
  ["XYZ bullet", { kind: "profileBullet", profileBulletDraft: "Reduced API latency from 200 ms to 120 ms using Redis caching." }],
  ["cover letter", { kind: "coverLetter", jd: "Acme seeks a TypeScript engineer with PostgreSQL and React experience.", coverLetterTemplate: "Dear Acme team, I build TypeScript services." }],
  ["application answer", { kind: "applicationAnswer", applicationQuestion: "Why do you want to work at Acme?", jd: "Acme builds accessible developer tools.", personalContext: "I want to make developer tools more accessible." }],
  ["resume selection", { kind: "resume", mode: "select", jd: "Acme seeks a TypeScript and React engineer." }],
  ["resume bullets", { kind: "resume", mode: "bullets", selectedExperienceIds: ["e0"], selectedProjectIds: ["p0"], jd: "Acme seeks a TypeScript and React engineer." }],
] as const) {
  test(`real inference: ${label}`, async () => {
    test.skip(!process.env.OLLAMA_E2E_URL, "Set OLLAMA_E2E_URL to test a real running Ollama model");
    test.setTimeout(300_000);
    const res = await api.post("/api/ai/generate", {
      timeout: 280_000,
      headers: { "x-ai-provider": "ollama", "x-ollama-base-url": process.env.OLLAMA_E2E_URL!, "x-ollama-model": process.env.OLLAMA_E2E_MODEL ?? "qwen2.5:1.5b" },
      data: {
        ...input,
        profile: { name: "Alex Audit", email: "alex@example.com", skills: ["TypeScript", "PostgreSQL", "React", "Redis"], experience: [{ id: "e0", company: "Example Co", title: "Engineer", bullets: ["Reduced API latency from 200 ms to 120 ms using Redis caching."] }], projects: [{ id: "p0", name: "Accessible Dashboard", tech: ["React", "TypeScript"], bullets: ["Built keyboard navigation for a React dashboard."] }] },
      },
    });
    expect(res.status(), await res.text()).toBe(200);
    const result = await res.json();
    await test.info().attach("model-output", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
    console.log(`${label}: ${JSON.stringify(result).slice(0, 1800)}`);
    if (input.kind === "profileBullet") expect(result.optimizedBullet).toBeTruthy();
    else if (input.kind === "applicationAnswer") {
      expect(result.optimizedAnswer).toBeTruthy();
      expect(result.optimizedAnswer).not.toContain("80%");
    }
    else if (input.kind === "coverLetter") {
      expect(result.outputMarkdown).toMatch(/Dear|hiring team/i);
      expect(result.outputMarkdown).not.toMatch(/\[Your |^#{1,6}\s+(Skills|Experience|Projects|Education)/im);
      expect(result.outputMarkdown).toContain("Alex");
    }
    else if (input.mode === "select") {
      expect(result.selectedExperienceIds).toEqual(["e0"]);
      expect(result.selectedProjectIds).toEqual(["p0"]);
      expect(result.outputMarkdown).not.toMatch(/https:\/\/example\.com|2020|\[optional\]/i);
    } else {
      expect(result.experienceBulletsById.e0?.length).toBeGreaterThan(0);
      expect(result.projectBulletsById.p0?.length).toBeGreaterThan(0);
    }
  });
}
test("20 signed-out users cannot invoke generation or probe Ollama", async () => {
  const guest = await request.newContext({ baseURL });
  try {
    const res = await guest.post("/api/ai/generate", { headers: { "x-ai-provider": "ollama", "x-ollama-base-url": providerUrl }, data: { kind: "profileBullet", profileBulletDraft: "Built services", profile } });
    expect(res.status()).toBe(401);
    expect((await guest.get("/api/ai/ollama-health")).status()).toBe(401);
    expect((await guest.post("/api/extension/resume-pdf", { data: { profile } })).status()).toBe(401);
  } finally { await guest.dispose(); }
});


test("21 application essays reject invented cache policy but accept supplied facts", async () => {
  const headers = { "x-ai-provider": "ollama", "x-ollama-base-url": providerUrl };
  const data = { kind: "applicationAnswer", profile, applicationQuestion: "Describe a technical challenge." };
  try {
    outputOverride = { optimizedAnswer: "I tuned the cache TTL and invalidation policy to improve the service." };
    const rejected = await api.post("/api/ai/generate", { headers, data });
    expect(rejected.status()).toBe(422);
    expect(await rejected.text()).toContain("unsupported cache-policy detail");
    const supported = await api.post("/api/ai/generate", { headers, data: { ...data, personalContext: "I tuned the cache TTL and invalidation policy." } });
    expect(supported.status()).toBe(200);
  } finally { outputOverride = null; }
});


test("22 experience essays discard invented scaling and hardware outcomes", async () => {
  const { groundExperienceAnswer } = await import("../../app/lib/answer-fact-guard");
  const candidate = JSON.parse((await import("node:fs")).readFileSync("tests/fixtures/cs-candidate-large.json", "utf8"));
  const answer = "At Northstar Systems I added Redis caching for PostgreSQL reads, reducing REST API p95 latency from 240 ms to 150 ms. The service could scale without adding more hardware.";
  const result = groundExperienceAnswer(answer, "Describe a technical challenge.", candidate, "", "", 800);
  expect(result).toContain(candidate.experience[0].bullets[0]);
  expect(result).not.toMatch(/scale|hardware/);
  expect(groundExperienceAnswer(answer, "Describe a technical challenge.", candidate, "", "", 20)).toBeNull();
  expect(groundExperienceAnswer("I want to explore better caching policies.", "What would you like to learn?", candidate)).toBe("I want to explore better caching policies.");
});
