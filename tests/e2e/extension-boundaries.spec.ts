import { test, expect, chromium } from '@playwright/test';
import path from 'node:path';

test('extension autofill stays in its originating tab after active tab changes', async () => {
  const extension = path.resolve('chrome-extension');
  const context = await chromium.launchPersistentContext(test.info().outputPath('tab-boundary'), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = worker.url().split('/')[2];
    await context.route('http://localhost:3000/boundary-*', route => route.fulfill({ contentType: 'text/html', body: '<h1>Fake application</h1><label for="first">First name</label><input id="first">' }));
    const origin = await context.newPage(); await origin.goto('http://localhost:3000/boundary-a'); await origin.bringToFront();
    await worker.evaluate(async () => { const c = (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<{ id: number }[]>; sendMessage(id: number, m: object): Promise<unknown> } } }).chrome; const [tab] = await c.tabs.query({ active: true, currentWindow: true }); await c.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' }); });
    await expect(origin.locator(`iframe[src^="chrome-extension://${id}/"]`)).toBeVisible();
    const sidebar = origin.frames().find(f => f.url().startsWith(`chrome-extension://${id}/`))!;
    const other = await context.newPage(); await other.goto('http://localhost:3000/boundary-b'); await other.bringToFront();
    const result = await sidebar.evaluate(async () => (globalThis as unknown as { chrome: { runtime: { sendMessage(m: object): Promise<unknown> } } }).chrome.runtime.sendMessage({ type: 'RELAY_TO_CONTENT', payload: { type: 'AUTOFILL', answers: [{ selector: '#first', text: 'Origin Only', label: 'First name' }] } }));
    expect(result).toMatchObject({ ok: true, filled: 1 });
    await expect(origin.locator('#first')).toHaveValue('Origin Only');
    await expect(other.locator('#first')).toHaveValue('');
  } finally { await context.close(); }
});

test('an arbitrary site cannot replace the synced extension profile through legacy storage', async () => {
  const extension = path.resolve('chrome-extension');
  const context = await chromium.launchPersistentContext(test.info().outputPath('storage-boundary'), { channel: 'chromium', headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(async () => (globalThis as unknown as { chrome: { storage: { local: { set(m: object): Promise<void> } } } }).chrome.storage.local.set({ profile: { name: 'Legitimate Synthetic Candidate' } }));
    const url = 'http://untrusted.example.test/poison';
    await context.route(url, route => route.fulfill({ contentType: 'text/html', body: `<script>localStorage.setItem('resume-optimizer-workspace-v1',JSON.stringify({profile:{name:'Injected Candidate'}}))</script><h1>Untrusted page</h1>` }));
    const page = await context.newPage(); await page.goto(url);
    // Wait for the actual isolated-world content script, not just page load.
    await expect.poll(async () => worker.evaluate(async () => {
      const c = (globalThis as unknown as { chrome: { tabs: { query(q: object): Promise<{ id: number }[]>; sendMessage(id: number, m: object): Promise<{ fields?: unknown[] }> } } }).chrome;
      const [tab] = await c.tabs.query({ url: 'http://untrusted.example.test/poison' });
      try { return Boolean((await c.tabs.sendMessage(tab.id, { type: 'SCRAPE' })).fields); } catch { return false; }
    })).toBe(true);
    const profile = await worker.evaluate(async () => (globalThis as unknown as { chrome: { storage: { local: { get(k: string): Promise<{ profile: { name: string } }> } } } }).chrome.storage.local.get('profile'));
    expect(profile.profile.name).toBe('Legitimate Synthetic Candidate');
  } finally { await context.close(); }
});
