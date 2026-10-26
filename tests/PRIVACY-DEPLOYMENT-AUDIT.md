# Local-first storage and free deployment audit

The previous web app persisted profile/document data and provider keys in Postgres. The new default stores personal workspaces in browser IndexedDB, partitioned by signed-in account ID. Postgres remains for authentication and optionally enabled cloud workspaces. No existing database records were deleted.

## Changes reviewed

- Atomic IndexedDB transactions retain unrelated profile/workspace changes across concurrent tabs.
- Local saves never silently fall back to a cloud API. A storage failure is visible and pauses editing.
- Account changes remount the workspace with a distinct owner key.
- Cloud workspace APIs are disabled by default, including direct authenticated calls.
- Optional cloud mode is separate and explicit; opening it does not upload device data. Cloud settings saves must not replace the separate device workspace's context or provider.
- Personal provider keys stay in device settings; cloud writes strip them and cloud reads redact historical values.
- Encrypted backup downloads exclude keys; wrong passwords, tampering, and invalid formats fail without restoring data. The UI previews a decrypted backup before the user chooses replacement.
- Extension Connect & Sync reads the configured signed-in app tab's origin-scoped IndexedDB. Q&A saves return to that same local store. Untrusted page-storage auto-import remains disabled.
- Hosted Ollama requests are disabled in the free deployment blueprint. Loopback on a remote server is not the user's computer.
- Generated PDF export uses structured data and a fixed escaped template. Found and fixed an unescaped project URL in the TeX renderer. Compiler processes use a minimal environment, cached packages, and a timeout. Custom raw TeX retains its separate OS sandbox and fails closed.
- Container startup applies versioned migrations to a fresh database, then starts Next.js standalone output. Local secrets are excluded from Docker build context.
- Patched production dependencies, including Next.js 16.4.3; `npm audit --omit=dev` reports zero vulnerabilities. Four moderate advisories remain in development-only Drizzle tooling; the runtime image prunes dev dependencies.

## Review/test iterations

1. Profile/resume local persistence: passed with zero `/api/database/*` traffic.
2. Settings key persistence exposed ambiguous field labels; moved help text outside labels, then retested.
3. Backup encryption, wrong-password rejection, UI preview/restore: passed. Scoped error assertions to the app's main content because newer Next.js adds a route-announcer alert.
4. Account isolation initially exposed a test cookie-swap race. Waiting for outstanding session requests confirmed the original IndexedDB data remained and the original account could reopen it.
5. Real Chromium extension local profile sync and local Q&A persistence: passed. Existing wrong-tab and untrusted-page boundaries retained.
6. Local/cloud switch: no implicit upload; added a regression for keeping their contexts/providers separate.
7. Existing workflows: auth, concurrent cloud patching, protected storage failures, provider-output guards, LaTeX file-access denial, PDF layout, profile editing, customization, and mobile layouts retested.
8. Linux container build: the 2 GB Docker VM killed fully emulated builds. Native-architecture build stages, a separate TypeScript gate, and single-worker webpack completed successfully; runtime modules remain Linux amd64.
9. The compiler binary required glibc 2.39, so the runtime was moved to Debian 13. Cache warmup now uses the real renderer, including its engine guards and font variants.
10. The first 512 MB PDF stress run was killed by the memory limit. The runtime uses a 128 MB Node old-space cap, small young generation, bounded compiler queue, and a cgroup memory-budget check that refuses a compile without 256 MB headroom. Local amd64 emulation can exceed a 512 MB cap during PDF stress; live native-host validation is still required.
11. Private-image extension testing caught a localhost permission restricted to port 3000. Loopback host permissions now support the explicitly configured app on alternate local ports.
12. Moved the existing route interceptor to Next.js 16’s Node-based `proxy.ts`, removing the Edge/Postgres runtime mismatch.

## Results

- Compatibility build with optional cloud mode enabled: **63 passed, 15 skipped** (78 total; approximately 1.3 minutes). Skips are live-provider opt-ins and the private-deployment-only check.
- Lint, TypeScript, production build, JavaScript syntax, and whitespace checks pass.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Default-private Linux image, capped at 512 MB: **11 passed, 2 skipped** in the privacy/extension suite. The skips are deliberately unavailable cloud-mode controls.
- Linux smoke at a **1 GB local emulation cap**: registration/session, protected redirect, blocked cloud reads/writes, blocked hosted Ollama, a one-page PDF, and three concurrent PDF jobs passed. Some 512 MB PDF stress runs were killed by the memory limit; this is not a fully verified 512 MB PDF deployment. Native free-host capacity remains unverified.
- Direct SQL after tests: **0 profile rows, 0 workspace rows, 1 applied migration**. Restarting the app did not reapply or destroy the migration.
- Linux raw custom TeX returns **503** because the Docker host blocks its namespace sandbox. It fails closed; generated PDF export works when memory is available. This is a real runtime limit, not a claimed full custom-TeX pass.
- Final 512 MB memory-pressure smoke returned explicit **503 insufficient-memory** responses for four PDF requests and kept the app healthy, with **0 OOM events**. Peak recorded before the last browser pass was 310,726,656 bytes. This is graceful pressure handling, not a successful 512 MB PDF-generation claim.
- The final runtime image contains no `.env`, `.env.local`, `env.example.local`, or `.npmrc` files. Legacy editor-created `env.example.local` is also excluded from Git and future build contexts.

## Boundaries

- No paid services or hosted resources were provisioned. Live launch requires confirmed Render and Neon connections and the reviewed source being available to the host.
- AI submissions still pass through the server/provider; PDFs still involve transient server processing. This is local persistence, not a claim of zero network disclosure.
- IndexedDB is not an encrypted vault. Browser-data deletion, device loss, and app-origin scripts remain relevant. Keep encrypted backups.
- Docker namespace permissions and free-tier behavior must also be verified on the eventual host. Local validation alone does not establish full custom-LaTeX support on Render.

See [deployment instructions](../DEPLOYMENT.md) and [privacy browser tests](e2e/local-first.spec.ts).

Final cleanup removed the disposable audit containers, isolated test database/network, obsolete dependency image, and temporary test secret file. The final runtime image is retained for review. A fresh-account browser check confirmed device storage by default, profile persistence after reload, and zero workspace API requests without setting a storage preference.
