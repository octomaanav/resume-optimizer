import { test, expect, request, chromium, type APIRequestContext, type BrowserContext } from '@playwright/test';
import path from 'node:path';
import { encryptBackup, decryptBackup } from '../../app/lib/workspace-backup';
import { emptyLocalSnapshot } from '../../app/lib/local-workspace';

let api: APIRequestContext;
let cookies: Awaited<ReturnType<BrowserContext['cookies']>>;
let owner: string;
const baseURL=process.env.E2E_BASE_URL || 'http://localhost:3000';
async function account(email: string) {
  const client=await request.newContext({baseURL});
  expect((await client.post('/api/auth/register',{data:{email,password:'AuditPassword123!'}})).status()).toBe(201);
  const csrf=await(await client.get('/api/auth/csrf')).json();
  await client.post('/api/auth/callback/credentials',{form:{csrfToken:csrf.csrfToken,email,password:'AuditPassword123!'},headers:{'X-Auth-Return-Redirect':'1'}});
  const session=await(await client.get('/api/auth/session')).json();
  return {client,owner:session.user.id,cookies:(await client.storageState()).cookies};
}
test.beforeAll(async()=>{
  const user=await account(`local-first-${Date.now()}@example.com`);api=user.client;cookies=user.cookies;owner=user.owner;
});
test.beforeEach(async({context})=>{await context.addCookies(cookies);await context.addInitScript(id=>localStorage.setItem(`resume-storage-mode:${id}`,'local'),owner);});
test.afterAll(async()=>{await api?.dispose();});

test('local profile and documents persist without sending workspace requests',async({page})=>{
  const traffic:string[]=[];page.on('request',r=>{if(r.url().includes('/api/database/'))traffic.push(r.url());});
  await page.goto('/profile');await page.getByLabel('Name',{exact:true}).fill('Device Only Candidate');await page.getByRole('button',{name:'Save',exact:true}).first().click();
  await expect(page.getByText(/^Saved /)).toBeVisible();await page.reload();await expect(page.getByLabel('Name',{exact:true})).toHaveValue('Device Only Candidate');
  await page.goto('/resumes/new');await page.locator('input').first().fill('Private base resume');await page.getByRole('button',{name:'Create resume',exact:true}).click();await page.waitForURL(/\/resumes\/(?!new)/);
  await page.reload();await expect(page.getByLabel('Title',{exact:true})).toHaveValue('Private base resume');
  await page.goto('/');await expect(page.getByLabel('Workspace summary')).toContainText('01Base documents');expect(traffic).toEqual([]);
});

test('personal keys stay on device and no content is automatically uploaded',async({page})=>{
  const traffic:string[]=[];page.on('request',r=>{if(r.url().includes('/api/database/'))traffic.push(r.url());});
  await page.goto('/settings');await page.getByRole('radio',{name:/Groq/}).click();await page.getByLabel('Groq API key',{exact:true}).fill('gsk_SYNTHETIC_NOT_A_REAL_KEY');await page.getByRole('button',{name:'Save',exact:true}).click();
  await expect(page.getByText(/^Saved /)).toBeVisible();await page.reload();await expect(page.getByLabel('Groq API key',{exact:true})).toHaveValue('gsk_SYNTHETIC_NOT_A_REAL_KEY');expect(traffic).toEqual([]);
  const server=await api.get('/api/database/workspace/me');
  if(server.status()===200)expect(JSON.stringify(await server.json())).not.toContain('gsk_SYNTHETIC');else expect(server.status()).toBe(403);
});

test('encrypted backup round trip excludes provider keys and rejects tampering',async()=>{
  const snapshot=emptyLocalSnapshot();snapshot.profile.name='Private Backup Candidate';snapshot.workspace.settings.groqApiKey='DO_NOT_EXPORT';
  const file=await encryptBackup(snapshot,'Long backup passphrase 123!');expect(file).not.toContain(snapshot.profile.name);expect(file).not.toContain('DO_NOT_EXPORT');
  const restored=await decryptBackup(file,'Long backup passphrase 123!');expect(restored.profile.name).toBe(snapshot.profile.name);expect(restored.workspace.settings.groqApiKey).toBe('');
  await expect(decryptBackup(file,'A wrong passphrase 123!')).rejects.toThrow('No data was changed');
  const bad=JSON.parse(file);bad.ciphertext='AAAA'+bad.ciphertext.slice(4);await expect(decryptBackup(JSON.stringify(bad),'Long backup passphrase 123!')).rejects.toThrow('No data was changed');
});

test('backup UI previews before restoring and wrong passwords do not change data',async({page})=>{
  await page.goto('/profile');await page.getByLabel('Name',{exact:true}).fill('Restorable Candidate');await page.getByRole('button',{name:'Save',exact:true}).first().click();await expect(page.getByText(/^Saved /)).toBeVisible();
  await page.goto('/settings');await page.getByLabel('Backup passphrase').fill('Keep this backup password!');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export encrypted backup'}).click();const file=await download;const backupPath=await file.path();expect(backupPath).toBeTruthy();
  await page.getByLabel('Backup passphrase').fill('Wrong password for backup!');await page.getByLabel('Open encrypted backup').setInputFiles(backupPath!);await expect(page.locator("main").getByRole('alert')).toContainText('No data was changed');await expect(page.getByRole('button',{name:'Restore to this device'})).toHaveCount(0);
  await page.getByLabel('Backup passphrase').fill('Keep this backup password!');await page.getByLabel('Open encrypted backup').setInputFiles(backupPath!);await expect(page.getByText(/Backup ready: Restorable Candidate/)).toBeVisible();
  await page.getByRole('button',{name:'Restore to this device'}).click();await expect(page.getByText('Backup restored to this device.')).toBeVisible();await page.goto('/profile');await expect(page.getByLabel('Name',{exact:true})).toHaveValue('Restorable Candidate');
});

test('browser database failures pause editing rather than replacing saved data',async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(window,'indexedDB',{get(){throw new Error('Synthetic blocked storage');}}));
  await page.goto('/profile');await expect(page.locator("main").getByRole('alert')).toContainText('Editing is paused');await expect(page.getByRole('button',{name:'Save',exact:true}).first()).toBeDisabled();
});

test('switching accounts never displays the previous account’s device workspace',async({page,context})=>{
  await page.goto('/profile');await page.getByLabel('Name',{exact:true}).fill('First Account Private Name');await page.getByRole('button',{name:'Save',exact:true}).first().click();await expect(page.getByText(/^Saved /)).toBeVisible();
  const other=await account(`isolated-local-${Date.now()}@example.com`);
  try{await context.clearCookies();await context.addCookies(other.cookies);await page.evaluate(id=>localStorage.setItem(`resume-storage-mode:${id}`,"local"),other.owner);await page.reload();await page.waitForLoadState('networkidle');await expect(page.getByLabel('Name',{exact:true})).toHaveValue('');
    await context.clearCookies();await context.addCookies(cookies);await page.reload();await page.waitForLoadState('networkidle');await expect(page.getByLabel('Name',{exact:true})).toHaveValue('First Account Private Name');
  }finally{await other.client.dispose();}
});

test('local cloud-mode toggle never uploads device data',async({page})=>{
  await page.goto('/settings');await expect(page.getByText('Stored on this device',{exact:true})).toBeVisible();const toggle=page.getByRole('button',{name:'Open cloud workspace'});test.skip(!await toggle.count(),'Cloud mode deliberately unavailable on this deployment');
  const writes:string[]=[];page.on('request',r=>{if(r.method()==='PUT'&&r.url().includes('/api/database/'))writes.push(r.url());});
  page.on('dialog',d=>d.accept());await toggle.click();await expect(page.getByText('Optional cloud workspace',{exact:true})).toBeVisible();expect(writes).toEqual([]);
  await page.getByRole('button',{name:'Use device storage'}).click();await expect(page.getByText('Stored on this device',{exact:true})).toBeVisible();expect(writes).toEqual([]);
});

test('extension explicitly syncs the app’s IndexedDB and saves Q&A locally',async()=>{
  test.setTimeout(120_000);
  const extension=path.resolve('chrome-extension');const c=await chromium.launchPersistentContext(test.info().outputPath('local-extension'),{channel:'chromium',headless:true,args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
  try{
    await c.addCookies(cookies);await c.addInitScript(id=>localStorage.setItem(`resume-storage-mode:${id}`,'local'),owner);
    const app=await c.newPage();await app.goto(`${baseURL}/profile`);await app.getByLabel('Name',{exact:true}).fill('Extension Local Candidate');await app.getByRole('button',{name:'Save',exact:true}).first().click();await expect(app.getByText(/^Saved /)).toBeVisible();
    const worker=c.serviceWorkers()[0]||await c.waitForEvent('serviceworker');const extensionId=worker.url().split('/')[2];
    const sidebar=await c.newPage();await sidebar.goto(`chrome-extension://${extensionId}/sidebar/sidebar.html`);
    const result=await sidebar.evaluate(async origin=>{
      const chrome=(globalThis as unknown as {chrome:{runtime:{sendMessage(m:object):Promise<{profile?:{name:string};error?:string}>}}}).chrome;
      return chrome.runtime.sendMessage({type:'SYNC_PROFILE',appUrl:origin});
    },baseURL);
    expect(result.error).toBeUndefined();expect(result.profile?.name).toBe('Extension Local Candidate');
    const now=Date.now();const saved=await sidebar.evaluate(async({origin,now})=>{
      const chrome=(globalThis as unknown as {chrome:{runtime:{sendMessage(m:object):Promise<{error?:string}>}}}).chrome;
      return chrome.runtime.sendMessage({type:'SAVE_QA_TEMPLATES',payload:{appUrl:origin,applicationAnswerDocs:[{id:'local-extension-answer',title:'Local extension question',question:'Why this team?',templateAnswer:'I build useful tools.',createdAt:now,updatedAt:now}]}});
    },{origin:baseURL,now});expect(saved.error).toBeUndefined();
    await app.goto(`${baseURL}/application-questions`);await expect(app.getByText('Local extension question',{exact:true})).toBeVisible();
  }finally{await c.close();}
});

test('cloud API never persists personal API keys when optional cloud mode is enabled',async()=>{
  const r=await api.put('/api/database/workspace/me',{data:{settings:{groqApiKey:'FORBIDDEN_CLOUD_SECRET',geminiApiKey:'FORBIDDEN_CLOUD_SECRET'}}});
  if(r.status()===403)return;expect(r.status()).toBe(200);expect(JSON.stringify(await r.json())).not.toContain('FORBIDDEN_CLOUD_SECRET');
  expect(JSON.stringify(await(await api.get('/api/database/workspace/me')).json())).not.toContain('FORBIDDEN_CLOUD_SECRET');
});

test('generated resume project URLs cannot inject executable TeX',async()=>{
  const { renderJakeResumeTex }=await import('../../app/lib/jake-latex');
  const { ProfileSchema }=await import('../../app/lib/profile-model');
  const tex=renderJakeResumeTex({profile:ProfileSchema.parse({name:'Safe Link',projects:[{id:'p1',name:'Test',link:'https://example.com/}\\input{/etc/passwd}%',bullets:['Built a service.']}]})});
  expect(tex).not.toContain('\\input{/etc/passwd}');
  expect(tex).toContain('\\href{https://example.com/\\}');
});

 test('concurrent local profile and settings saves retain both changes',async({page,context})=>{
  await page.goto('/profile');await page.getByLabel('Name',{exact:true}).fill('Concurrent Local Candidate');
  const other=await context.newPage();await other.goto('/settings');await other.getByLabel('Personal context',{exact:true}).fill('Independent device context');
  await Promise.all([page.getByRole('button',{name:'Save',exact:true}).first().click(),other.getByRole('button',{name:'Save',exact:true}).click()]);
  await expect(page.getByText(/^Saved /)).toBeVisible();await expect(other.getByText(/^Saved /)).toBeVisible();
  await page.reload();await expect(page.getByLabel('Name',{exact:true})).toHaveValue('Concurrent Local Candidate');
  await other.reload();await expect(other.getByLabel('Personal context',{exact:true})).toHaveValue('Independent device context');
});

test('default deployment refuses cloud saves and hosted Ollama probes',async()=>{
  test.skip(process.env.E2E_CLOUD_DISABLED!=='1','Run against the default private deployment image');
  for(const route of ['/api/database/profiles/me','/api/database/workspace/me']){
    expect((await api.get(route)).status()).toBe(403);
    expect((await api.put(route,{data:{}})).status()).toBe(403);
  }
  expect((await api.get('/api/ai/ollama-health',{headers:{'x-ollama-base-url':'http://169.254.169.254'}})).status()).toBe(403);
  const blocked=await api.post('/api/ai/generate',{headers:{'x-ai-provider':'ollama','x-ollama-base-url':'http://169.254.169.254'},data:{kind:'profileBullet',profile:{name:'Synthetic privacy audit'},profileBulletDraft:'Built an accessible dashboard.'}});
  expect(blocked.status(),await blocked.text()).toBe(403);
});

test('cloud settings cannot overwrite a separate device workspace’s context or provider',async({page})=>{
  await page.goto('/settings');await expect(page.getByText('Stored on this device',{exact:true})).toBeVisible();
  const toggle=page.getByRole('button',{name:'Open cloud workspace'});test.skip(!await toggle.count(),'Cloud storage is unavailable on this deployment');
  await page.getByRole('radio',{name:/Groq/}).click();await page.getByLabel('Personal context',{exact:true}).fill('Private device context stays here');await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByText(/^Saved /)).toBeVisible();
  page.on('dialog',d=>d.accept());await toggle.click();await expect(page.getByText('Optional cloud workspace',{exact:true})).toBeVisible();
  await page.getByLabel('Personal context',{exact:true}).fill('Different optional cloud context');await page.getByRole('button',{name:'Save',exact:true}).click();await expect(page.getByText(/^Saved /)).toBeVisible();
  await page.getByRole('button',{name:'Use device storage'}).click();await expect(page.getByText('Stored on this device',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Personal context',{exact:true})).toHaveValue('Private device context stays here');await expect(page.getByRole('radio',{name:/Groq/})).toHaveAttribute('aria-checked','true');
});
