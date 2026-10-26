import { test, expect, request, type APIRequestContext, type BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import { createResumeDraft, createApplicationAnswerDraft } from '../../app/lib/document-schemas';

let api: APIRequestContext;
let cookies: Awaited<ReturnType<BrowserContext['cookies']>>;
let resumeId: string;
const title = 'Professional application document ' + 'long-name-'.repeat(30);
test.beforeAll(async () => {
  api = await request.newContext({baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000'});
  const email = `ui-review-${Date.now()}@example.com`;
  expect((await api.post('/api/auth/register',{data:{name:'UI regression',email,password:'AuditPassword123!'}})).ok()).toBeTruthy();
  const csrf = await (await api.get('/api/auth/csrf')).json();
  await api.post('/api/auth/callback/credentials',{form:{csrfToken:csrf.csrfToken,email,password:'AuditPassword123!'},headers:{'X-Auth-Return-Redirect':'1'}});
  cookies = (await api.storageState()).cookies;
  const profile = JSON.parse(fs.readFileSync('tests/fixtures/cs-candidate-large.json','utf8'));
  expect((await api.put('/api/database/profiles/me',{data:profile})).ok()).toBeTruthy();
  const resume = createResumeDraft(title,{subsetEnabled:true,experienceIds:[profile.experience[0].id],projectIds:[profile.projects[0].id]});
  resumeId=resume.id;
  expect((await api.put('/api/database/workspace/me',{data:{resumes:[resume],applicationAnswerDocs:[createApplicationAnswerDraft(title)]}})).ok()).toBeTruthy();
});
test.beforeEach(async ({context}) => {await context.addCookies(cookies);});
test.afterAll(async () => {await api?.dispose();});

test('overview reflects saved profile and documents and opens its recent document',async ({page})=>{
  await page.goto('/');
  const summary=page.getByLabel('Workspace summary');
  await expect(summary).toHaveAttribute('aria-busy','false');
  await expect(summary).toContainText('13Experiences');
  await expect(summary).toContainText('13Projects');
  await expect(summary).toContainText('02Base documents');
  await page.locator('main').getByRole('link').filter({hasText:title}).filter({hasText:'Resume'}).click();
  await expect(page).toHaveURL(new RegExp(`/resumes/${resumeId}$`));
  await expect(page.getByLabel('Title',{exact:true})).toHaveValue(title);
});

test('long content stays within phone, tablet and desktop layouts',async({page})=>{
  test.setTimeout(120_000);
  for(const width of [320,768,1440]){
    await page.setViewportSize({width,height:900});
    for(const path of ['/','/profile','/documents','/application-questions','/optimize','/settings',`/resumes/${resumeId}`]){
      await page.goto(path);
      await expect(page.locator('main h1')).toBeVisible();
      await page.waitForLoadState('networkidle');
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
      expect(overflow,`${width}px ${path} horizontal overflow`).toBeLessThanOrEqual(1);
      await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('link')).toHaveCount(6);
    }
  }
});

test('skip link, section shortcuts and dark paper preview remain usable',async({page})=>{
  await page.goto('/profile');
  await expect(page.getByRole('heading',{name:'Profile',exact:true})).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await page.getByRole('navigation',{name:'Profile sections'}).getByRole('link',{name:'Projects',exact:true}).click();
  const section=page.getByRole('heading',{name:'Projects & Outside Experience',exact:true});
  await expect(section).toBeInViewport();
  expect((await section.boundingBox())!.y).toBeGreaterThan(64);
  await page.getByRole('radio',{name:'Dark',exact:true}).click();
  await page.goto(`/resumes/${resumeId}`);
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  const paper=page.locator('.resume-paper');
  await expect(paper).toHaveCSS('background-color','rgb(255, 255, 255)');
  await expect(paper).toHaveCSS('color','rgb(32, 32, 32)');
  for(const metric of await paper.locator('li .font-semibold').all()) await expect(metric).toHaveCSS('color','rgb(32, 32, 32)');
  await expect(page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Documents'})).toHaveAttribute('aria-current','page');
});

 test('authentication screens have accurate workspace context',async({page})=>{
  for(const [route,label] of [['/login','Sign in'],['/signup','Create account']]) {
    await page.goto(route);
    await expect(page.locator('.workspace-topbar').getByText(label,{exact:true})).toBeVisible();
  }
});
