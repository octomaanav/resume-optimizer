# Tailr

A Next.js 16 / React 19 application for maintaining a profile, tailoring application documents, and exporting resumes. Authentication uses Auth.js v5 with Drizzle and Postgres. Styling uses Tailwind v4.

Personal workspaces use browser IndexedDB by default. The zero-budget deployment keeps cloud document storage disabled and uses Postgres for accounts. Settings provides encrypted backups and an explicit optional cloud-workspace mode. AI and PDF requests still involve server processing; see the privacy boundaries in [DEPLOYMENT.md](DEPLOYMENT.md).

## Local development

```sh
npm install
cp .env.example .env.local
# Configure DATABASE_URL and a generated AUTH_SECRET in .env.local.
# Reuse the existing local Postgres server if available.
npm run db:push
npm run dev
```

`db:push` is for local schema synchronization. Deployment uses checked-in migrations against a fresh database or a deliberately baselined migration history. Do not point a new deployment at an existing database initialized by `db:push` without reviewing that history.

For production output locally:

```sh
npm run build
npm run start
```

`npm run start` loads local environment values at runtime and runs standalone output with its static assets. Docker startup additionally applies migrations before serving traffic.

## Verification

```sh
npm run lint
npm run typecheck
npm run test:e2e
```

The legacy cloud regressions require a compatibility build with `NEXT_PUBLIC_CLOUD_WORKSPACES_ENABLED=true` and `NEXT_PUBLIC_DEFAULT_STORAGE=cloud`. The private deployment defaults to device storage; test it with `tests/e2e/local-first.spec.ts`. Live-provider checks are opt-in. See [test instructions](tests/e2e/README.md) and the [privacy/deployment audit](tests/PRIVACY-DEPLOYMENT-AUDIT.md).

## Free deployment

The prepared configuration uses a Render Free Docker service and Neon Free Postgres. No paid resources are declared. Render and Neon accounts must be connected before live provisioning, and free tiers have sleep/usage limits.

See [deployment setup and release checks](DEPLOYMENT.md), [Dockerfile](Dockerfile), and [Render blueprint](render.yaml). The Chrome extension lives in `chrome-extension/`; Connect & Sync reads a saved device workspace from an open signed-in app tab.
