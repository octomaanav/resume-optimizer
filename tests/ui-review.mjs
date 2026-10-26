import { chromium, request } from '@playwright/test';
import fs from 'node:fs';
(async()=>{
 const round = process.env.UI_ROUND || '1';
 const out = `artifacts/ui-review/round-${round}`;fs.mkdirSync(out,{recursive:true});
 const api = await request.newContext({baseURL:'http://localhost:3000'});
 const csrf = await (await api.get('/api/auth/csrf')).json();
 await api.post('/api/auth/callback/credentials',{form:{csrfToken:csrf.csrfToken,email:'groq-extension-cs@example.com',password:'SyntheticAuditPassword123!'},headers:{'X-Auth-Return-Redirect':'1'}});
 if(!(await (await api.get('/api/auth/session')).json()).user)throw Error('Synthetic audit account login failed');
 const workspace=(await(await api.get('/api/database/workspace/me')).json()).workspace;
 if(!workspace.resumes.length){const profile=(await(await api.get('/api/database/profiles/me')).json()).profile;const now=Date.now();const res=await api.put('/api/database/workspace/me',{data:{resumes:[{id:'ui-review-resume',title:'Backend Engineer · Base resume',createdAt:now,updatedAt:now,template:'jake',subsetEnabled:true,defaults:{experienceIds:profile.experience.slice(0,4).map(e=>e.id),projectIds:profile.projects.slice(0,2).map(e=>e.id)}}]}});if(!res.ok())throw Error(await res.text());}
 const b = await chromium.launch({channel:'chrome'});const ctx = await b.newContext({viewport:{width:1440,height:1000}});await ctx.addCookies((await api.storageState()).cookies);
 const p = await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 for(const [name,url] of [['home','/'],['profile','/profile'],['documents','/documents'],['optimize','/optimize'],['settings','/settings'],['questions','/application-questions'],['editor','/resumes/ui-review-resume'],['tailor','/optimize/resume']]){
  await p.goto(`http://localhost:3000${url}`);await p.waitForLoadState('networkidle');await p.screenshot({path:`${out}/${name}.png`});
 }
 await p.getByRole('radio',{name:'Dark',exact:true}).click();await p.goto('http://localhost:3000');await p.waitForLoadState('networkidle');await p.screenshot({path:`${out}/dark.png`});await p.goto('http://localhost:3000/resumes/ui-review-resume');await p.waitForLoadState('networkidle');await p.locator('.resume-paper').waitFor();await p.evaluate(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});await p.screenshot({path:`${out}/dark-editor.png`,animations:'disabled'});
 await p.getByRole('radio',{name:'Light',exact:true}).click();
 await p.setViewportSize({width:390,height:844});
 for(const [name,url]of[['home','/'],['profile','/profile'],['documents','/documents'],['optimize','/optimize'],['settings','/settings'],['questions','/application-questions'],['editor','/resumes/ui-review-resume'],['tailor','/optimize/resume']]){await p.goto(`http://localhost:3000${url}`);await p.waitForLoadState('networkidle');await p.screenshot({path:`${out}/mobile-${name}.png`});const w=await p.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:innerWidth}));if(w.scroll>w.viewport)errors.push(`${name} overflow ${JSON.stringify(w)}`);}
 await p.setViewportSize({width:320,height:800});await p.goto('http://localhost:3000');await p.waitForLoadState('networkidle');await p.screenshot({path:`${out}/phone-320.png`});
 const guest=await b.newPage({viewport:{width:390,height:844}});for(const route of ['login','signup']){await guest.goto(`http://localhost:3000/${route}`);await guest.waitForLoadState('networkidle');await guest.screenshot({path:`${out}/${route}.png`});}
 fs.writeFileSync(`${out}/review.json`,JSON.stringify({errors},null,2));console.log(JSON.stringify({out,errors}));await b.close();await api.dispose();if(errors.length)process.exitCode=1;
})();
