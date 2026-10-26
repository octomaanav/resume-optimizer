import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';

test('Groq selects relevant entries from 13 experiences and 13 projects and fills one readable page', async ({ page, request }) => {
  test.skip(process.env.GROQ_E2E !== '1', 'Requires live Groq and Postgres');
  test.setTimeout(300_000);
  const profile = JSON.parse(fs.readFileSync('tests/fixtures/cs-candidate-large.json', 'utf8'));
  const out = 'artifacts/groq-large-audit';
  fs.mkdirSync(out, { recursive: true });
  const email = 'groq-extension-cs@example.com', password = 'SyntheticAuditPassword123!';
  const csrf = await (await request.get('/api/auth/csrf')).json();
  await request.post('/api/auth/callback/credentials', { form: { csrfToken: csrf.csrfToken, email, password }, headers: { 'X-Auth-Return-Redirect': '1' } });
  expect((await (await request.get('/api/auth/session')).json()).user).toBeTruthy();
  expect((await request.put('/api/database/profiles/me', { data: profile })).ok()).toBe(true);
  const persisted = (await (await request.get('/api/database/profiles/me')).json()).profile;
  expect(persisted.experience).toHaveLength(13); expect(persisted.projects).toHaveLength(13);
  // Use the authenticated browser context to inspect the entire profile UI.
  await page.context().addCookies((await request.storageState()).cookies);
  await page.goto('/profile');
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(profile.name);
  for (const entry of profile.experience) await expect(page.getByText(entry.company, { exact: true })).toBeVisible();
  for (const entry of profile.projects) await expect(page.getByText(`${entry.role} • ${entry.name}`, { exact: true })).toBeVisible();
  await page.screenshot({ path: out + '/large-profile.png', fullPage: true });
  const response = await request.post('/api/ai/generate', {
    headers: { 'x-ai-provider': 'groq', 'x-groq-model': 'openai/gpt-oss-120b' },
    data: { kind: 'resume', mode: 'bullets', selectBest: true, profile,
      jd: fs.readFileSync('tests/fixtures/software-engineer-jd.txt', 'utf8'),
      skillsMd: 'Preserve facts. Exactly three complete bullets per selected entry. No invented metrics.' },
    timeout: 180_000,
  });
  expect(response.status(), await response.text()).toBe(200);
  const generated = await response.json();
  expect(generated.selectedExperienceIds).toHaveLength(4);
  expect(generated.selectedProjectIds).toHaveLength(2);
  expect(new Set(generated.selectedExperienceIds).size).toBe(4);
  expect(new Set(generated.selectedProjectIds).size).toBe(2);
  const relevantExp = ['exp-northstar', 'exp-harbor', 'exp-stress-1', 'exp-stress-2', 'exp-stress-6', 'exp-stress-7'];
  const relevantProj = ['proj-observe', 'proj-access', 'proj-stress-1', 'proj-stress-2', 'proj-stress-6', 'proj-stress-7'];
  expect(generated.selectedExperienceIds.filter((id: string) => relevantExp.includes(id)).length).toBeGreaterThanOrEqual(3);
  expect(generated.selectedProjectIds.every((id: string) => relevantProj.includes(id))).toBe(true);
  const pdf = await request.post('/api/extension/resume-pdf', { data: { profile, ...generated, subsetEnabled: true }, timeout: 120_000 });
  expect(pdf.status(), pdf.ok() ? '' : await pdf.text()).toBe(200);
  const bytes = await pdf.body(); fs.writeFileSync(out + '/tailored.pdf', bytes);
  expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  expect(Number(pdf.headers()['x-resume-bullets-trimmed'])).toBe(0);
  execFileSync('pdftotext', ['-layout', out + '/tailored.pdf', out + '/tailored.txt']);
  execFileSync('pdftotext', ['-bbox', out + '/tailored.pdf', out + '/tailored-bbox.html']);
  const text = fs.readFileSync(out + '/tailored.txt', 'utf8');
  const bbox = fs.readFileSync(out + '/tailored-bbox.html', 'utf8');
  const bottom = Math.max(...Array.from(bbox.matchAll(/yMax="([\d.]+)"/g), m => Number(m[1])));
  // Letter page: body should reach the lower part of the page and remain inside it.
  expect(bottom).toBeGreaterThan(680); expect(bottom).toBeLessThan(775);
  const canonical = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const normalized = canonical(text);
  let bullets = 0;
  for (const [entries, ids, map] of [[profile.experience, generated.selectedExperienceIds, generated.experienceBulletsById], [profile.projects, generated.selectedProjectIds, generated.projectBulletsById]] as const) {
    for (const id of ids) {
      const entry = entries.find((e: { id: string }) => e.id === id);
      expect(entry).toBeTruthy();
      for (const bullet of map[id] || entry.bullets) { expect(normalized).toContain(canonical(bullet)); bullets++; }
    }
  }
  expect(bullets).toBe(18);
  expect(text).not.toContain('Java Chess Engine');
  const keywords = ['TypeScript', 'Node.js', 'React', 'PostgreSQL', 'Redis', 'Docker', 'AWS', 'GitHub Actions', 'CI/CD', 'OpenTelemetry', 'Playwright'];
  const matched = keywords.filter(k => text.toLowerCase().includes(k.toLowerCase()));
  expect(matched).toHaveLength(keywords.length);
  const report = { profile: { experiences: 13, projects: 13, bullets: 78 }, selectedExperienceIds: generated.selectedExperienceIds, selectedProjectIds: generated.selectedProjectIds, pages: 1, retainedBullets: bullets, bulletsDropped: 0, bottomTextPositionPt: bottom, pageHeightPt: 792, requiredKeywordCoverage: { matched, total: keywords.length }, metricWarnings: generated.metricWarnings };
  fs.writeFileSync(out + '/generation.json', JSON.stringify(generated, null, 2));
  fs.writeFileSync(out + '/resume-results.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
});
