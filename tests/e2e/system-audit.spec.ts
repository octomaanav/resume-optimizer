import { test, expect, request as createRequest } from '@playwright/test';
import fs from 'node:fs';
import type { APIRequestContext } from '@playwright/test';

let api: APIRequestContext;
const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000';
const profile = { name: 'System Audit Synthetic', education: [], experience: [], projects: [] };
test.beforeAll(async () => {
  api = await createRequest.newContext({ baseURL });
  const email = `system-audit-${Date.now()}@example.com`;
  expect((await api.post('/api/auth/register', { data: { email, password: 'AuditPassword123!' } })).status()).toBe(201);
  const csrf = await (await api.get('/api/auth/csrf')).json();
  await api.post('/api/auth/callback/credentials', { form: { csrfToken: csrf.csrfToken, email, password: 'AuditPassword123!' }, headers: { 'X-Auth-Return-Redirect': '1' } });
  expect((await (await api.get('/api/auth/session')).json()).user).toBeTruthy();
});
test.beforeEach(async ({ context }) => {
  await context.addCookies((await api.storageState()).cookies);
  expect((await api.put('/api/database/profiles/me', { data: profile })).ok()).toBe(true);
});
test.afterAll(async () => { await api?.dispose(); });

test('system 01 partial settings preserves unrelated values', async () => {
  expect((await api.put('/api/database/workspace/me', { data: { settings: { aiProvider: 'groq', personalContext: 'Keep my context', skillsMd: 'Keep my rules', groqModel: 'openai/gpt-oss-120b' } } })).ok()).toBe(true);
  const updated = await api.put('/api/database/workspace/me', { data: { settings: { skillsMd: 'New rules' } } });
  const settings = (await updated.json()).workspace.settings;
  expect(settings.aiProvider).toBe('groq'); expect(settings.personalContext).toBe('Keep my context'); expect(settings.skillsMd).toBe('New rules');
});

test('system 02 concurrent signup returns conflict rather than server error', async () => {
  const data = { email: `signup-race-${Date.now()}@example.com`, password: 'AuditPassword123!' };
  const results = await Promise.all([api.post('/api/auth/register', { data }), api.post('/api/auth/register', { data })]);
  expect(results.map(r => r.status()).sort()).toEqual([201, 409]);
});

test('system 03 rejects passwords exceeding bcrypt byte limit', async () => {
  const response = await api.post('/api/auth/register', { data: { email: `bytes-${Date.now()}@example.com`, password: '😀'.repeat(20) } });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toContain('72');
});

test('system 04 profile fetch failure is visible and cannot save empty replacement', async ({ page }) => {
  await page.route('**/api/database/profiles/me', route => route.request().method() === 'GET' ? route.fulfill({ status: 503, json: { error: 'Profile temporarily unavailable' } }) : route.continue());
  await page.goto('/profile');
  await expect(page.locator("main").getByRole('alert').filter({ hasText: 'Profile temporarily unavailable' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true }).first()).toBeDisabled();
});

test('system 05 visibility refresh preserves unsaved profile', async ({ page }) => {
  await page.goto('/profile'); await expect(page.getByLabel('Name', { exact: true })).toHaveValue(profile.name);
  await page.getByLabel('Name', { exact: true }).fill('Unsaved local name');
  await api.put('/api/database/profiles/me', { data: { ...profile, name: 'Remote updated name' } });
  const refreshed = page.waitForResponse(r => r.url().includes('/api/database/profiles/me') && r.request().method() === 'GET');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await refreshed;
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Unsaved local name');
});

test('system 06 failed profile save never shows success', async ({ page }) => {
  await page.goto('/profile'); await expect(page.getByLabel('Name', { exact: true })).toHaveValue(profile.name);
  await page.route('**/api/database/profiles/me', route => route.request().method() === 'PUT' ? route.fulfill({ status: 503, json: { error: 'Save temporarily unavailable' } }) : route.continue());
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  await expect(page.getByText(/Could not save profile/)).toBeVisible();
  await expect(page.getByText(/^Saved /)).toHaveCount(0);
});

test('system 07 edits typed during profile save survive the response', async ({ page }) => {
  await page.goto('/profile'); await expect(page.getByLabel('Name', { exact: true })).toHaveValue(profile.name);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/database/profiles/me', async route => { if (route.request().method() === 'PUT') { await gate; await route.continue(); } else await route.continue(); });
  await page.getByLabel('Name', { exact: true }).fill('Snapshot sent');
  const pending = page.waitForRequest(r => r.url().includes('/api/database/profiles/me') && r.method() === 'PUT');
  await page.getByRole('button', { name: 'Save', exact: true }).first().click(); await pending;
  await page.getByLabel('Name', { exact: true }).fill('Typed while saving');
  const response = page.waitForResponse(r => r.url().includes('/api/database/profiles/me') && r.request().method() === 'PUT');
  release(); await response;
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Typed while saving');
});

test('system 08 unfit PDF returns explicit failure', async () => {
  const education = Array.from({ length: 30 }, (_, i) => ({ id: `school-${i}`, school: `Synthetic School ${i}`, degree: 'Computer Science', details: ['A complete education detail that must not be silently removed.'] }));
  const response = await api.post('/api/extension/resume-pdf', { data: { profile: { ...profile, education } }, timeout: 120_000 });
  expect(response.status()).toBe(422); expect((await response.json()).error).toMatch(/fit|page/i);
});

test('system 09 duplicate profile IDs are rejected', async () => {
  const response = await api.put('/api/database/profiles/me', { data: { ...profile, experience: [{ id: 'duplicate', company: 'One' }, { id: 'duplicate', company: 'Two' }] } });
  expect(response.status()).toBe(400);
});

test('system 10 account ID in body cannot change another user profile', async () => {
  const response = await api.put('/api/database/profiles/me', { data: { ...profile, id: 'not-this-user', userId: 'not-this-user' } });
  expect(response.ok()).toBe(true);
  expect((await (await api.get('/api/database/profiles/me')).json()).profile.name).toBe(profile.name);
});

// A harmless canary proves whether custom TeX can read server-local files.
test('system 11 custom LaTeX cannot read an absolute server file', async () => {
  const canary = '/private/tmp/resume-audit-canary.txt'; fs.writeFileSync(canary, 'AUDITCANARYONLY');
  try {
    const response = await api.post('/api/latex/pdf', { data: { latex: `\\documentclass{article}\\usepackage{verbatim}\\begin{document}\\verbatiminput{${canary}}\\end{document}` }, timeout: 120_000 });
    expect(response.status()).toBe(422);
  } finally { fs.rmSync(canary, { force: true }); }
});

test('system 12 ordinary generated LaTeX still compiles through isolated API', async () => {
  const { renderJakeResumeTex } = await import('../../app/lib/jake-latex');
  const { ProfileSchema } = await import('../../app/lib/profile-model');
  const latex = renderJakeResumeTex({ profile: ProfileSchema.parse({ ...profile, experience: [{ id: 'normal', company: 'Synthetic Co', title: 'Engineer', bullets: ['Built TypeScript services for 25 users.'] }] }) });
  const response = await api.post('/api/latex/pdf', { data: { latex }, timeout: 60_000 });
  expect(response.status(), response.ok() ? '' : await response.text()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');
});
