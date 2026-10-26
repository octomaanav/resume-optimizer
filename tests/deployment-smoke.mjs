import { request } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const baseURL=process.env.E2E_BASE_URL || 'http://localhost:3001';
const out='artifacts/deployment';fs.mkdirSync(out,{recursive:true});
const api=await request.newContext({baseURL});
const result={baseURL,checks:[]};
try {
  let healthy=false;for(let attempt=0;attempt<40;attempt++){try{healthy=(await api.get('/api/health',{timeout:1500})).status()===200;}catch{}if(healthy)break;await new Promise(r=>setTimeout(r,1000));}assert.ok(healthy,'Deployment did not become healthy');result.checks.push('liveness');
  const protectedPage=await api.get('/profile',{maxRedirects:0});assert.ok([302,307].includes(protectedPage.status()));assert.ok(protectedPage.headers().location.includes('/login'));result.checks.push('protected-route redirect');
  const email=`deployment-smoke-${Date.now()}@example.com`;
  assert.equal((await api.post('/api/auth/register',{data:{email,password:'SyntheticDeploymentPassword123!'}})).status(),201);
  const csrf=await(await api.get('/api/auth/csrf')).json();await api.post('/api/auth/callback/credentials',{form:{csrfToken:csrf.csrfToken,email,password:'SyntheticDeploymentPassword123!'},headers:{'X-Auth-Return-Redirect':'1'}});
  assert.ok((await(await api.get('/api/auth/session')).json()).user);result.checks.push('registration and credentials session');
  for(const path of ['/api/database/profiles/me','/api/database/workspace/me']){
    assert.equal((await api.get(path)).status(),403);assert.equal((await api.put(path,{data:{}})).status(),403);
  }result.checks.push('cloud reads and writes disabled');
  assert.equal((await api.get('/api/ai/ollama-health')).status(),403);result.checks.push('hosted Ollama disabled');
  const profile={name:'Deployment Smoke Candidate',email:'smoke@example.com',location:'Boston, MA',skills:['TypeScript','PostgreSQL'],experience:[{id:'e1',company:'Synthetic Systems',title:'Software Engineer',start:'2024',end:'2025',bullets:['Built 6 accessible interfaces and added 40 integration tests.']}],projects:[{id:'p1',name:'Private Workspace',tech:['TypeScript'],bullets:['Implemented local document storage.']}],education:[{id:'ed1',school:'Synthetic University',degree:'BS Computer Science',start:'2020',end:'2024'}]};
  const pdf=await api.post('/api/extension/resume-pdf',{data:{profile},timeout:120_000});
  if(process.env.E2E_MEMORY_GUARD==='1') {
    const responses=[pdf,...await Promise.all([1,2,3].map(()=>api.post('/api/extension/resume-pdf',{data:{profile},timeout:120_000})))];
    result.pdfStatuses=responses.map(response=>response.status());
    for(const response of responses){
      assert.ok([200,503].includes(response.status()),await response.text().then(t=>t.slice(0,150)));
      if(response.status()===503)assert.match((await response.json()).error,/free server memory/);
      else assert.equal((await PDFDocument.load(await response.body())).getPageCount(),1);
    }
    assert.equal((await api.get('/api/health')).status(),200);
    result.checks.push('memory-constrained exports succeed or report insufficient memory; app stays healthy');
  } else {
  assert.equal(pdf.status(),200,await pdf.text().then(t=>t.slice(0,200)));
  const bytes=await pdf.body();const doc=await PDFDocument.load(bytes);assert.equal(doc.getPageCount(),1);assert.ok(bytes.length>5000);fs.writeFileSync(`${out}/generated-resume.pdf`,bytes);result.checks.push('fixed-template PDF: one valid page');
  const concurrent=await Promise.all([1,2,3].map(i=>api.post('/api/extension/resume-pdf',{data:{profile:{...profile,name:`Concurrent Candidate ${i}`}},timeout:120_000})));
  for(const response of concurrent){assert.equal(response.status(),200);assert.equal((await PDFDocument.load(await response.body())).getPageCount(),1);}
  result.checks.push('three concurrent PDF requests complete through the bounded queue');
  const raw=await api.post('/api/latex/pdf',{data:{latex:String.raw`\documentclass{article}\begin{document}Sandbox smoke test.\end{document}`},timeout:30_000});
  result.customLatex={status:raw.status()};
  if(raw.status()===200){
    const canary=await api.post('/api/latex/pdf',{data:{latex:String.raw`\documentclass{article}\begin{document}\input{/etc/os-release}\end{document}`},timeout:30_000});assert.notEqual(canary.status(),200);result.checks.push('custom TeX works; absolute-file canary denied');
  }else{assert.equal(raw.status(),503,await raw.text());result.customLatex.reason=(await raw.json()).error;result.checks.push('custom TeX fails closed: namespace unavailable');}
  }
  fs.writeFileSync(`${out}/${process.env.E2E_MEMORY_GUARD==='1' ? 'memory-smoke' : 'smoke'}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await api.dispose();}
