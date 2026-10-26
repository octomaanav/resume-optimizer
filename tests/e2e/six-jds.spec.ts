import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PDFDocument } from 'pdf-lib';
import type { Profile } from '../../app/lib/profile-model';
import cases from '../fixtures/jds/cases.json';

type Generation = { selectedExperienceIds: string[]; selectedProjectIds: string[]; experienceBulletsById: Record<string, string[]>; projectBulletsById: Record<string, string[]>; metricWarnings?: unknown[] };
for (const role of cases) {
  test(`six JDs: ${role.id}`, async ({ request }) => {
    test.skip(process.env.GROQ_E2E !== '1', 'Requires live Groq');
    test.setTimeout(300_000);
    const profile: Profile = JSON.parse(fs.readFileSync('tests/fixtures/cs-candidate-large.json', 'utf8'));
    const out = `artifacts/six-jds/${role.id}`;
    fs.mkdirSync(out, { recursive: true });
    const csrf = await (await request.get('/api/auth/csrf')).json();
    await request.post('/api/auth/callback/credentials', { form: { csrfToken: csrf.csrfToken, email: 'groq-extension-cs@example.com', password: 'SyntheticAuditPassword123!' }, headers: { 'X-Auth-Return-Redirect': '1' } });
    expect((await (await request.get('/api/auth/session')).json()).user).toBeTruthy();
    expect((await request.put('/api/database/profiles/me', { data: profile })).ok()).toBe(true);
    const saved = (await (await request.get('/api/database/profiles/me')).json()).profile;
    expect(saved).toEqual(profile);
    const jd = fs.readFileSync(`tests/fixtures/jds/${role.id}.txt`, 'utf8');
    const response = await request.post('/api/ai/generate', { headers: { 'x-ai-provider': 'groq', 'x-groq-model': 'openai/gpt-oss-120b' }, data: { kind: 'resume', mode: 'bullets', selectBest: true, profile, jd, skillsMd: 'Exactly three full bullets per selected entry. Preserve source facts and numbers. Never invent implementation details or outcomes.' }, timeout: 180_000 });
    expect(response.status(), await response.text()).toBe(200);
    const generated: Generation = await response.json();
    fs.writeFileSync(out + '/generation.json', JSON.stringify(generated, null, 2));
    expect(generated.selectedExperienceIds).toHaveLength(4); expect(new Set(generated.selectedExperienceIds).size).toBe(4);
    expect(generated.selectedProjectIds).toHaveLength(2); expect(new Set(generated.selectedProjectIds).size).toBe(2);
    expect(generated.selectedExperienceIds.filter(id => role.experiencePool.includes(id)).length).toBeGreaterThanOrEqual(role.minimumRelevantExperiences);
    expect(generated.selectedProjectIds.every(id => role.projectPool.includes(id))).toBe(true);
    const rows: { kind: string; id: string; label: string; before: string[]; after: string[] }[] = [];
    for (const id of generated.selectedExperienceIds) {
      const e = profile.experience.find(e => e.id === id); expect(e).toBeTruthy();
      rows.push({ kind: 'experience', id, label: e!.company, before: e!.bullets, after: generated.experienceBulletsById[id] ?? e!.bullets });
    }
    for (const id of generated.selectedProjectIds) {
      const p = profile.projects.find(p => p.id === id); expect(p).toBeTruthy();
      rows.push({ kind: 'project', id, label: p!.name, before: p!.bullets, after: generated.projectBulletsById[id] ?? p!.bullets });
    }
    fs.writeFileSync(out + '/source-comparison.json', JSON.stringify(rows, null, 2));
    const pdf = await request.post('/api/extension/resume-pdf', { data: { profile, ...generated, subsetEnabled: true }, timeout: 120_000 });
    expect(pdf.status(), pdf.ok() ? '' : await pdf.text()).toBe(200);
    const bytes = await pdf.body(); fs.writeFileSync(out + '/resume.pdf', bytes);
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    execFileSync('pdftotext', ['-layout', out + '/resume.pdf', out + '/resume.txt']);
    execFileSync('pdftotext', ['-bbox', out + '/resume.pdf', out + '/bbox.html']);
    execFileSync('pdftoppm', ['-scale-to', '1200', '-png', out + '/resume.pdf', out + '/preview']);
    const text = fs.readFileSync(out + '/resume.txt', 'utf8');
    const bbox = fs.readFileSync(out + '/bbox.html', 'utf8');
    const words = [...bbox.matchAll(/xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)"/g)].map(m => m.slice(1).map(Number));
    const bounds = { left: Math.min(...words.map(w => w[0])), top: Math.min(...words.map(w => w[1])), right: Math.max(...words.map(w => w[2])), bottom: Math.max(...words.map(w => w[3])) };
    const canonical = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    const normalized = canonical(text);
    const missingBullets = rows.flatMap(row => row.after.filter(b => !normalized.includes(canonical(b))));
    const has = (body: string, k: string) => canonical(body).includes(canonical(k));
    const keywordCoverage = { matched: role.required.filter(k => has(text, k)), missing: role.required.filter(k => !has(text, k)), bodyMatched: role.required.filter(k => has(rows.flatMap(r => r.after).join(' '), k)), unsupportedPreferred: role.preferred };
    const omitted = Number(pdf.headers()['x-resume-bullets-trimmed']);
    const report = { role: role.title, profileExperiences: profile.experience.length, profileProjects: profile.projects.length, selection: rows.map(r => ({ id: r.id, label: r.label })), pages, omitted, missingBullets, bulletCount: rows.flatMap(r => r.after).length, bounds, keywordCoverage, metricWarnings: generated.metricWarnings, review: 'Pending human source comparison and image review' };
    fs.writeFileSync(out + '/results.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
    expect(pages).toBe(1); expect(omitted).toBe(0); expect(missingBullets).toEqual([]);
    for (const row of rows) expect(row.after).toHaveLength(3);
    expect(bounds.bottom).toBeGreaterThan(680); expect(bounds.bottom).toBeLessThan(775);
    expect(bounds.left).toBeGreaterThan(15); expect(bounds.right).toBeLessThan(600);
    expect(keywordCoverage.missing).toEqual([]);
    expect(keywordCoverage.bodyMatched).toHaveLength(role.required.length);
    for (const term of role.preferred) expect(has(text, term), `Unsupported preferred skill: ${term}`).toBe(false);
    expect(text).toContain(profile.email); expect(text).toContain(profile.name);
  });
}
