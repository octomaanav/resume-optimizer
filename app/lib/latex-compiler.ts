import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { homedir, platform, tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
export class LatexCompileError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}

/** Raw TeX is a program: run it without app secrets, network access or host files.
 * Cached packages are read-only. A missing OS sandbox fails closed.
 */
async function compileIsolatedLatexInner(latex: string): Promise<Uint8Array> {
  const resolver = require('node-latex-compiler').platformResolver as { resolveTectonicExecutable: (options: object) => string | null };
  const binary = resolver.resolveTectonicExecutable({});
  if (!binary) throw new LatexCompileError('LaTeX compiler is unavailable.', 503);
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'resume-tex-')));
  try {
    await writeFile(path.join(dir, 'document.tex'), latex);
    const cacheParent = process.env.XDG_CACHE_HOME || (platform() === 'darwin' ? path.join(homedir(), 'Library/Caches') : path.join(homedir(), '.cache'));
    const cache = path.join(cacheParent, 'Tectonic');
    const args = ['--untrusted', '--only-cached', '--outdir', dir, path.join(dir, 'document.tex')];
    let command: string;
    let sandboxArgs: string[];
    if (platform() === 'darwin' && existsSync('/usr/bin/sandbox-exec')) {
      const allowedReads = ['/System', '/usr/bin', '/usr/lib', '/usr/share', '/Library/Fonts', '/dev', path.dirname(binary), cache, dir];
      // JSON string escaping is also valid for these literal sandbox strings.
      const subpath = (p: string) => `(subpath ${JSON.stringify(p)})`;
      const parents = new Set<string>();
      for (const entry of allowedReads) {
        for (let parent = path.dirname(entry); !parents.has(parent); parent = path.dirname(parent)) {
          parents.add(parent);
          if (parent === path.dirname(parent)) break;
        }
      }
      // dyld/TeX open parent directories during resource discovery. Grant the
      // directories themselves, never the files or subdirectories they contain.
      const directoryReads = [...parents].map(p => `(literal ${JSON.stringify(p)})`).join(' ');
      const policy = `(version 1)(allow default)(deny network*)
        (deny file-read-data (require-not (require-any ${directoryReads} ${allowedReads.map(subpath).join(' ')})))
        (deny file-write* (require-not (require-any ${subpath(dir)} (literal "/dev/null"))))`;
      command = '/usr/bin/sandbox-exec'; sandboxArgs = ['-p', policy, binary, ...args];
    } else if (platform() === 'linux' && existsSync('/usr/bin/bwrap')) {
      command = '/usr/bin/bwrap';
      sandboxArgs = ['--unshare-all', '--die-with-parent', '--new-session', '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp'];
      for (const entry of ['/usr/bin', '/usr/lib', '/usr/share/fonts', '/usr/share/fontconfig', '/lib', '/lib64', '/etc/fonts', path.dirname(binary), cache]) {
        if (existsSync(entry)) sandboxArgs.push('--ro-bind', entry, entry);
      }
      sandboxArgs.push('--bind', dir, dir, '--chdir', dir, binary, ...args);
    } else {
      throw new LatexCompileError('PDF compilation requires an OS sandbox (macOS sandbox-exec or Linux bubblewrap).', 503);
    }
    try {
      const output = await execute(command, sandboxArgs, {
        cwd: dir, timeout: 20_000, killSignal: "SIGKILL", maxBuffer: 1_000_000, encoding: "utf8",
        env: { NODE_ENV: 'production', PATH: '/usr/bin:/bin', HOME: homedir(), XDG_CACHE_HOME: cacheParent, TECTONIC_UNTRUSTED_MODE: '1' },
      });
      // TeX can produce a PDF despite a denied optional input; never silently
      // deliver a document that omitted a requested resource.
      if (/not permitted|permission denied|not found|could not (?:open|find)/i.test(output.stderr)) {
        throw new LatexCompileError('LaTeX references an unavailable or disallowed resource. Use self-contained source and cached packages.');
      }
      return new Uint8Array(await readFile(path.join(dir, 'document.pdf')));
    } catch (error) {
      if (error instanceof LatexCompileError) throw error;
      const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
      if (platform() === "linux" && /namespace|bwrap:.*(?:not permitted|permission denied)/i.test(stderr)) {
        throw new LatexCompileError('This host does not permit the custom-LaTeX sandbox. Generated resume PDFs and .tex export remain available.', 503);
      }
      throw new LatexCompileError('LaTeX compilation failed or timed out. Use self-contained source and cached packages.');
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
}

/** Only for our fixed template after escaping every profile field. Never use for custom TeX. */
async function compileTrustedTemplateLatexInner(latex: string): Promise<Uint8Array> {
  const resolver = require('node-latex-compiler').platformResolver as { resolveTectonicExecutable: (options: object) => string | null };
  const binary = resolver.resolveTectonicExecutable({});
  if (!binary) throw new LatexCompileError('LaTeX compiler is unavailable.', 503);
  const dir = await mkdtemp(path.join(tmpdir(), 'resume-template-'));
  const cacheParent = process.env.XDG_CACHE_HOME || (platform() === 'darwin' ? path.join(homedir(), 'Library/Caches') : path.join(homedir(), '.cache'));
  try {
    await writeFile(path.join(dir, 'document.tex'), latex);
    await execute(binary, ['--untrusted', '--only-cached', '--outdir', dir, path.join(dir, 'document.tex')], {
      cwd: dir, timeout: 20_000, killSignal: 'SIGKILL', maxBuffer: 1_000_000,
      env: { NODE_ENV: 'production', PATH: '/usr/bin:/bin', HOME: homedir(), XDG_CACHE_HOME: cacheParent, TECTONIC_UNTRUSTED_MODE: '1' },
    });
    return new Uint8Array(await readFile(path.join(dir, 'document.pdf')));
  } catch { throw new LatexCompileError('Template compilation failed or timed out. The deployment may need its TeX package cache warmed.'); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

// One compiler at a time, with a small bounded queue, protects a free 512 MB host.
const compilerGlobal = globalThis as typeof globalThis & { __resumePdfQueue?: { tail: Promise<void>; pending: number } };
async function withCompilerSlot<T>(job: () => Promise<T>): Promise<T> {
  const queue = compilerGlobal.__resumePdfQueue ??= { tail: Promise.resolve(), pending: 0 };
  if (queue.pending >= 3) throw new LatexCompileError('PDF export is busy. Please try again shortly.', 429);
  queue.pending++;
  const before = queue.tail;
  let release!: () => void;
  queue.tail = new Promise<void>(resolve => { release = resolve; });
  await before;
  try {
    if (platform() === "linux") {
      try {
        const [limitText, usedText] = await Promise.all([
          readFile('/sys/fs/cgroup/memory.max', 'utf8'),
          readFile('/sys/fs/cgroup/memory.current', 'utf8'),
        ]);
        const limit = Number(limitText.trim()), used = Number(usedText.trim());
        if (Number.isFinite(limit) && Number.isFinite(used) && limit - used < 256 * 1024 * 1024) {
          throw new LatexCompileError('PDF export needs more free server memory. Try again shortly, or download the .tex file and compile locally.', 503);
        }
      } catch (error) {
        if (error instanceof LatexCompileError) throw error;
        // A non-container host may not expose cgroup v2 memory counters.
      }
    }
    return await job();
  } finally { queue.pending--; release(); }
}
export function compileIsolatedLatex(latex: string) { return withCompilerSlot(() => compileIsolatedLatexInner(latex)); }
export function compileTrustedTemplateLatex(latex: string) { return withCompilerSlot(() => compileTrustedTemplateLatexInner(latex)); }
