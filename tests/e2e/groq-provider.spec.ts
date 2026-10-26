import { test, expect } from "@playwright/test";
import { generateGroqJson } from "../../app/lib/groq";

test("Groq sends JSON mode and keeps the key out of the prompt", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.response_format).toEqual({ type: "json_object" });
      expect(body.model).toBe("test-model");
      expect(String(init?.body)).not.toContain("test-only-secret");
      return Response.json({ choices: [{ message: { content: '{"optimizedAnswer":"Grounded answer"}' } }] });
    };
    expect(await generateGroqJson(new Request("http://localhost/test", { headers: { "x-groq-api-key": "test-only-secret", "x-groq-model": "test-model" } }), "Return JSON from these facts.")).toContain("Grounded answer");
  } finally { globalThis.fetch = original; }
});
test("Groq retries one short rate limit", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => ++calls === 1
      ? Response.json({ error: { message: "Rate limited" } }, { status: 429, headers: { "Retry-After": "0.001" } })
      : Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
    expect(await generateGroqJson(new Request("http://localhost/test", { headers: { "x-groq-api-key": "test-only-secret" } }), "Return JSON")).toBe('{"ok":true}');
    expect(calls).toBe(2);
  } finally { globalThis.fetch = original; }
});
test("Groq redacts provider errors and rejects empty outputs", async () => {
  const original = globalThis.fetch;
  try {
    const req = new Request("http://localhost/test", { headers: { "x-groq-api-key": "test-only-secret" } });
    globalThis.fetch = async () => Response.json({ error: { message: "Bad key test-only-secret" } }, { status: 401 });
    const result = await generateGroqJson(req, "Return JSON");
    expect(result).toBeInstanceOf(Response);
    expect(await (result as Response).text()).not.toContain("test-only-secret");
    globalThis.fetch = async () => Response.json({ choices: [] });
    expect((await generateGroqJson(req, "Return JSON") as Response).status).toBe(502);
  } finally { globalThis.fetch = original; }
});
test("Resume export keeps complete long bullet endings", async () => {
  const { ProfileSchema } = await import("../../app/lib/profile-model");
  const { renderJakeResumeTex } = await import("../../app/lib/jake-latex");
  const bullet = "Instrumented 6 Docker services with OpenTelemetry and CloudWatch alerts, trimming incident diagnosis from 45 to 20 min.";
  const profile = ProfileSchema.parse({ name: "Synthetic Candidate", experience: [{ id: "exp", company: "Test Co", title: "Engineer", bullets: [bullet] }] });
  const tex = renderJakeResumeTex({ profile });
  expect(tex).toContain(bullet);
  expect(tex).toContain("diagnosis from 45 to 20 min.");
});
test("Resume rewrites reject invented percentages but allow equivalent number formatting", async () => {
  const { ProfileSchema } = await import("../../app/lib/profile-model");
  const { guardResumeBulletMetrics } = await import("../../app/lib/resume-metric-guard");
  const original = "Reduced REST API p95 latency from 240 ms to 150 ms for 12000 daily requests.";
  const profile = ProfileSchema.parse({ experience: [{ id: "exp", bullets: [original] }] });
  const invalid = { exp: ["Cut latency 40% (240 to 150 ms) for 12k requests."] };
  expect(guardResumeBulletMetrics(profile, invalid, {})).toHaveLength(1);
  expect(invalid.exp).toEqual([original]);
  const valid = { exp: ["Improved p95 latency from 240 ms to 150 ms across 12,000 daily requests."] };
  expect(guardResumeBulletMetrics(profile, valid, {})).toHaveLength(0);
  expect(valid.exp[0]).toContain("12,000");
});

test('Resume facts reject cross-role technologies even without numbers', async () => {
  const { guardResumeBulletFacts } = await import('../../app/lib/resume-fact-guard');
  const { default: fs } = await import('node:fs');
  const profile = JSON.parse(fs.readFileSync('tests/fixtures/cs-candidate-large.json', 'utf8'));
  const experience = { 'exp-stress-5': ['Implemented Redis caching for Node.js REST API requests in Docker.'] };
  const originalProject = profile.projects.find((e: { id: string }) => e.id === 'proj-stress-6');
  const projects = { 'proj-stress-6': [originalProject.bullets[0], 'Added OpenTelemetry tracing to Node.js REST API handlers.'] };
  const warnings = guardResumeBulletFacts(profile, experience, projects);
  expect(experience['exp-stress-5']).toEqual([profile.experience.find((e: { id: string }) => e.id === 'exp-stress-5').bullets[0]]);
  expect(projects['proj-stress-6']).toEqual([originalProject.bullets[0], 'Added OpenTelemetry tracing to Node.js REST API handlers.']);
  expect(warnings).toHaveLength(1);
  expect(warnings[0].reason).toContain('Technology');
});

test('Resume facts reject invented compliance and benchmark outcomes', async () => {
  const { guardResumeBulletFacts } = await import('../../app/lib/resume-fact-guard');
  const { default: fs } = await import('node:fs');
  const profile = JSON.parse(fs.readFileSync('tests/fixtures/cs-candidate-large.json', 'utf8'));
  const experience = { 'exp-stress-7': [
    'Implemented 5 accessible React components with explicit screen-reader labels, ensuring WCAG compliance.',
    'Added 26 Playwright tests for focus order and keyboard navigation.',
  ] };
  const projects = { 'proj-stress-6': ['Benchmarked Redis caching against PostgreSQL reads across 20000 synthetic requests, showing latency gains.'] };
  const warnings = guardResumeBulletFacts(profile, experience, projects);
  expect(warnings).toHaveLength(2);
  expect(experience['exp-stress-7'][0]).toBe(profile.experience.find((e: { id: string }) => e.id === 'exp-stress-7').bullets[0]);
  expect(experience['exp-stress-7'][1]).toBe('Added 26 Playwright tests for focus order and keyboard navigation.');
  expect(projects['proj-stress-6'][0]).toBe(profile.projects.find((e: { id: string }) => e.id === 'proj-stress-6').bullets[0]);
});


test('Required evidence ranks Python/SQL projects above adjacent caching work', async () => {
  const { selectByRequiredEvidence } = await import('../../app/lib/resume-selection');
  const fs = await import('node:fs');
  const profile = JSON.parse(fs.readFileSync('tests/fixtures/cs-candidate-large.json', 'utf8'));
  const modelExp = ['exp-campus', 'exp-stress-9', 'exp-stress-6', 'exp-stress-1'];
  const modelProj = ['proj-stress-3', 'proj-stress-6'];
  const selected = selectByRequiredEvidence(profile, fs.readFileSync('tests/fixtures/jds/data.txt', 'utf8'), modelExp, modelProj);
  expect(selected.projectIds).toContain('proj-stress-3'); expect(selected.projectIds).toContain('proj-stress-8');
  expect(selected.projectIds).not.toContain('proj-stress-6');
  expect(selected.experienceIds).toContain('exp-stress-3');
  expect(selectByRequiredEvidence(profile, 'An unstructured job description.', modelExp, modelProj)).toEqual({ experienceIds: modelExp, projectIds: modelProj });
  const platform = selectByRequiredEvidence(profile, fs.readFileSync('tests/fixtures/jds/platform.txt', 'utf8'), modelExp, modelProj);
  const body = profile.experience.filter((e: { id: string }) => platform.experienceIds.includes(e.id)).flatMap((e: { bullets: string[] }) => e.bullets).join(' ');
  expect(body).toContain('Linux');
});


test('Preferred tool lists cannot outrank explicit required qualifications', async () => {
  const { selectByRequiredEvidence } = await import('../../app/lib/resume-selection');
  const { ProfileSchema } = await import('../../app/lib/profile-model');
  const profile = ProfileSchema.parse({ projects: [
    { id: 'required-both', tech: ['Python', 'SQL'], bullets: ['Built Python and SQL tools.'] },
    { id: 'required-one', tech: ['Python'], bullets: ['Built Python imports.'] },
    { id: 'preferred-only', tech: ['Rust', 'Go'], bullets: ['Built Rust and Go tools.'] },
  ] });
  const result = selectByRequiredEvidence(profile, 'Engineer\n\nRequired qualifications\n- Python\n- SQL\n\nPreferred, not mandatory\n- Rust\n- Go', [], ['preferred-only', 'required-both']);
  expect(result.projectIds).toEqual(['required-both', 'required-one']);
});


test('Required evidence distinguishes C, C++ and C#', async () => {
  const { selectByRequiredEvidence } = await import('../../app/lib/resume-selection');
  const { ProfileSchema } = await import('../../app/lib/profile-model');
  const profile = ProfileSchema.parse({ projects: [
    { id: 'cpp', tech: ['C++'], bullets: ['Built a C++ tool.'] },
    { id: 'csharp', tech: ['C#'], bullets: ['Built a C# tool.'] },
    { id: 'python', tech: ['Python'], bullets: ['Built a Python tool.'] },
  ] });
  const result = selectByRequiredEvidence(profile, 'Engineer\n\nRequired qualifications\n- C#\n- Python', [], ['cpp', 'python']);
  expect(result.projectIds).toContain('csharp'); expect(result.projectIds).toContain('python'); expect(result.projectIds).not.toContain('cpp');
});
