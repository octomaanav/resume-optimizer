import { buildSync } from 'esbuild';
import { writeFile, rm, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const file='/tmp/resume-warm-renderer.cjs';
try {
  const output=buildSync({entryPoints:['app/lib/jake-latex.ts'],bundle:true,platform:'node',format:'cjs',write:false});
  await writeFile(file,output.outputFiles[0].contents);
  const {renderJakeResumeTex}=require(file);
  const profile={name:'Build Package Check',email:'build@example.invalid',phone:'',location:'Test City',summary:'',links:[{label:'Website',url:'https://example.invalid'}],skills:['TypeScript'],skillCategories:[{id:'c',label:'Languages',items:['TypeScript']}],experience:[{id:'e',company:'Example',title:'Engineer',location:'Test City',start:'2020',end:'2021',bullets:['Built 6 interfaces and added 40 tests.']}],projects:[{id:'p',name:'Example Project',tech:['TypeScript'],link:'https://example.invalid',start:'2020',end:'2021',bullets:['Implemented local storage.']}],education:[{id:'ed',school:'Example University',degree:'BS Computer Science',location:'Test City',start:'2020',end:'2024',details:['Coursework: Computer Science']} ]};
  await mkdir('deploy',{recursive:true});
  await writeFile('deploy/warm-template.tex',renderJakeResumeTex({profile,highlightMetrics:true}));
}finally{await rm(file,{force:true});}
