import { createRequire } from 'node:module';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const binary = require('node-latex-compiler').platformResolver.resolveTectonicExecutable({});
if (!binary) throw new Error('Tectonic binary missing. Use a Linux amd64 runtime image.');
const dir = await mkdtemp(path.join(tmpdir(), 'warm-tex-'));
try {
  const source = await readFile('deploy/warm-template.tex','utf8');
  const file = path.join(dir, 'warm.tex'); await writeFile(file, source);
  execFileSync(binary, ['--untrusted', '--outdir', dir, file], { stdio: 'inherit', timeout: 300_000 });
} finally { await rm(dir, { recursive: true, force: true }); }
