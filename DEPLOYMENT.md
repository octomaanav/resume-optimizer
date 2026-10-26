# Free deployment with device-owned workspaces

## Chosen architecture

| Layer | Default | What it contains |
| --- | --- | --- |
| User's browser | IndexedDB, scoped to origin and account ID | Profile, resumes, letters, answers, job descriptions, generated drafts, settings, personal API keys |
| User's files | Password-encrypted backup download | Saved workspace and profile; provider keys excluded |
| Account database | Neon Free Postgres + Drizzle | Account identity, password hashes, optional OAuth account records |
| Application server | Render Free Docker web service | Next.js app, authentication, transient AI and PDF processing |
| Extension | Chrome local storage + explicit app-tab connection | A device-local copy of the connected profile and selected settings/answers |

No paid resources, persistent server disk, object store, Supabase instance, or always-running AI model is required. Local storage is the default even when optional cloud storage is enabled. Cloud document APIs return 403 in the default deployment.

The database schema retains the existing `profiles` and `user_workspace` tables for compatibility; they remain unused by device-mode saves. Existing cloud records are not automatically migrated or deleted. No retention or erasure guarantee is implied for historical database backups.

## Privacy boundaries

- Device mode makes **no profile/workspace database requests**. Saving never silently falls back to cloud storage.
- Device data is separated by signed-in account ID. Signing out does not delete it.
- IndexedDB is browser storage, **not an encrypted vault**. Anyone with access to the browser profile or code executing on the app origin may access it.
- Browser data can be cleared, evicted, or lost with the device. Settings provides a persistent-storage request and encrypted backup/export/restore. Persistence does not protect against explicit browser-data deletion.
- Backups use Web Crypto AES-256-GCM, a new random salt/IV per export, and PBKDF2-SHA-256 with 600,000 iterations. The passphrase is not saved. Personal provider keys are excluded.
- Hosted AI submissions go through the app server to the selected provider. PDF export sends the selected document data to the server. Neither operation intentionally writes it to the application database.
- The provider may have its own retention policy. Local storage does not change that policy.
- Ollama runs wherever the app server runs. The public deployment disables Ollama requests. For entirely device-local AI, run the app and Ollama locally; a hosted app cannot reach the user's `localhost` by using the server's loopback address.
- Extension connection reads IndexedDB only from a matching, explicitly configured app tab. A job website cannot auto-import its own page storage into the extension. Opening the app and signing in is required before connecting a device workspace.

## Create free hosting accounts

Render and Neon must be connected before provisioning a live deployment. Choose their **Free** plans and do not add paid resources or a card-backed upgrade. A Vercel account alone cannot provision the selected Render runtime or Neon database.

1. Create a Neon Free project near the server region (Render Oregon / a nearby Neon US region).
2. Put its connection string into Render's secret `DATABASE_URL` field. Use certificate-verified TLS (`DATABASE_REQUIRE_TLS=true` is in the blueprint). Do not commit it or paste it into chat.
3. Connect the reviewed repository to Render and apply `render.yaml`. It creates only a `plan: free` web service. The Docker image targets Linux amd64.
4. Set `AUTH_URL` to the exact assigned `https://…onrender.com` origin. The blueprint generates `AUTH_SECRET`.
5. Keep `NEXT_PUBLIC_CLOUD_WORKSPACES_ENABLED=false`. This setting is compiled into the browser bundle; changing it requires rebuilding the image. Do not just change the running environment.
6. The container runs versioned Drizzle migrations before starting Next.js. A migration failure stops startup; it does not launch against an unknown schema. Do not use `db:push` for a live deployment.
7. Verify the deployment using the checklist below before treating it as ready.

No live resource has been provisioned merely by adding these files. The deployment source must include the current uncommitted fixes; deploying the repository's older remote commit would omit them.

### Free-tier limits

Render's free service can sleep when idle, has limited instance hours, and uses ephemeral server storage. Neon Free also has quotas. These plans are suitable for an early version with no budget, not an uptime guarantee. Resume data stays in the browser through server restarts. Verify current plan limits before activating: [Render Free](https://render.com/docs/free), [Neon pricing](https://neon.com/pricing).

Render's free Postgres database is deliberately not in the blueprint because it expires. See [Render free database limits](https://render.com/docs/free#free-postgres).

## PDF behavior and release gate

- Generated resumes submit structured data to the fixed template endpoint, with all profile text and project links escaped. Compiler child processes receive no application secrets, use cached TeX packages, and have a timeout.
- Raw custom LaTeX uses the separate OS-sandboxed route. It fails closed if Linux user namespaces/bubblewrap are unavailable. Do not add `--privileged`, disable the sandbox, or hand app secrets to a raw compiler to make a host pass.
- A synthetic resume is generated from the actual renderer at build time, then `scripts/warm-latex.mjs` preloads its fonts and packages. Normal resume compilation does not need runtime package downloads.
- The runtime uses a 128 MB Node old-space cap, small young generation, and bounded single-compiler queue. A cgroup v2 memory-budget check refuses a compile when less than 256 MB is available, so low-memory requests receive a retry/.tex-export message rather than knowingly starting a process that can kill the app.
- Local Linux amd64 emulation passed PDF stress at a 1 GB cap but exceeded 512 MB in some runs. Browser privacy tests passed at 512 MB. **Native Render Free PDF capacity is not yet verified**; its live PDF check remains a release gate. A free instance may report insufficient memory for compilation.
- A host that cannot run the raw-LaTeX sandbox must be reported as limited; testing the image locally is not proof that Render permits the same namespaces.

## Local production rehearsal

Docker is optional for ordinary development. The provided local Postgres installation remains valid.

```sh
npm install
npm run lint
npm run typecheck
npm run build
npm run start
```

For a container, use a **fresh test database** or an existing database with a valid Drizzle migration journal. A database initialized with `db:push` should not be blindly migrated with the initial CREATE TABLE migration. Preserve it and export/import or baseline deliberately.

```sh
docker build --platform linux/amd64 -t tailr:local .
# Configure a test DATABASE_URL reachable from inside Docker, AUTH_SECRET and AUTH_URL.
# Use the deployment rehearsal compose file after reviewing its env settings:
RESUME_RUNTIME_ENV_FILE=/absolute/path/to/test-runtime.env docker compose -f deploy/compose.production.yml up --build
```

The container builds JavaScript on the builder’s native architecture, checks TypeScript in a separate process, and uses a single-worker webpack build with a bounded Node heap. Runtime dependencies and Tectonic are installed separately for Linux amd64; build-machine native modules are removed from standalone output. Fully emulated builds exceeded the local 2 GB VM limit. Ordinary `npm run build` still checks TypeScript normally. Render’s free/Hobby Starter pipeline currently has 8 GB build memory and included minutes, separately from runtime RAM: [build pipeline](https://render.com/docs/build-pipeline). Keep its spend limit at zero and do not add a payment method for this no-budget setup.

## Moving earlier cloud workspaces

Before disabling cloud access on an existing installation:

1. Temporarily build that installation with `NEXT_PUBLIC_CLOUD_WORKSPACES_ENABLED=true`.
2. In Settings, explicitly open the separate cloud workspace and export an encrypted backup.
3. Switch to device storage and restore the backup after reviewing its preview. This replaces that device workspace, so export it first if it already has data.
4. Reenter personal API keys on the device. Existing server-stored keys are not exposed by the new cloud API. Rotate keys if they were previously saved on a server you do not control.
5. Disable cloud access and rebuild. Cloud rows are deliberately not deleted automatically.

Device and cloud workspaces are separate: switching does not upload the local profile or merge documents. Each deployment origin/browser has its own IndexedDB; a backup is needed when changing domains, devices, or browsers.

## Deployment checks

1. `/api/health` returns 200. This is liveness, not proof of database or PDF readiness.
2. Sign up, sign in, sign out, and sign back in.
3. Save a profile and a base resume. Reload; both remain.
4. Browser Network shows no `/api/database/*` requests in device mode.
5. Authenticated profile/workspace cloud endpoints return 403 with cloud disabled.
6. Export an encrypted backup, open with the wrong password (must not restore), then restore with the correct password.
7. Switch accounts in one browser; each sees only its own workspace.
8. Generate and download a one-page PDF. Confirm headers and actual PDF content.
9. Try self-contained raw TeX and a harmless absolute-file read canary. Require successful safe compilation and denied file access before claiming full custom-LaTeX support.
10. Connect the extension from the app tab; verify local profile sync and local answer persistence.
11. Confirm no provider API key appears in cloud workspace responses, backups, build artifacts, or logs.

## Research

[IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), [browser storage/persistence limits](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [Web Crypto key derivation](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey), [Render Docker](https://render.com/docs/docker), [Render blueprint reference](https://render.com/docs/blueprint-spec).

When running a second local instance with a different Auth.js secret, use `127.0.0.1:3001` for the rehearsal and `localhost:3000` for development. Cookies are scoped to host, not port; two instances on `localhost` otherwise share default cookie names.
