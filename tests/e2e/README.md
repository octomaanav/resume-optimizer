# End-to-end audit

Start Postgres, configure `.env.local` (`DATABASE_URL`, `AUTH_SECRET`), run `npm install`, `npm run db:push`, and keep `npm run dev` running.

Run `npm run test:e2e`. The suite uses installed Google Chrome, creates isolated test accounts, and stops on the first failure. It covers profile stress inputs, resume selections/customizations/LaTeX/PDF, legacy content, settings, keyboard access, generation workflows, mobile widths, concurrent updates and session expiry. Accounts and synthetic test documents remain in the local database.

Browser generation regressions use an in-process Ollama protocol fixture. This verifies the real browser/API/database path without a paid key, but does not measure model quality. Five separate inference cases are skipped unless a real server is configured:

```sh
OLLAMA_E2E_URL=http://127.0.0.1:11436 OLLAMA_E2E_MODEL=qwen2.5:1.5b npm run test:e2e -- --grep 'real inference'
```

Actual inference outputs are attached as JSON in the test results. Model behavior is nondeterministic; the small test model does not establish production writing quality. Gemini and OAuth require real credentials and are not exercised by these tests.

Use `E2E_BASE_URL` for another local app port, or `PLAYWRIGHT_CHANNEL` to select an installed browser channel. Tests assume HTTP localhost Auth.js cookies. Failed runs retain screenshots and traces in ignored `test-results/`. Avoid simultaneous Playwright runs against the same output directory.

## Real Groq and unpacked Chrome extension

Set `GROQ_API_KEY` in `.env.local`; select Groq in the app's Settings. The default model is `openai/gpt-oss-120b` (verify availability for your account). The server keeps the environment key out of browser/extension storage.

Run `npx playwright install chromium`, then `GROQ_E2E=1 npm run test:e2e` against the running app. This loads the actual unpacked MV3 extension and exercises a complete synthetic CS application, live Groq essay/resume generation, PDF upload, keyword checks, and disconnected-install behavior. It never submits the application. See [GROQ-AUDIT.md](GROQ-AUDIT.md) and the local `artifacts/groq-audit/` outputs.

Large-profile resume selection test (real Groq):

```sh
GROQ_E2E=1 npm run test:e2e -- tests/e2e/large-profile.spec.ts
```

Seeds the isolated `groq-extension-cs@example.com` audit account with
`tests/fixtures/cs-candidate-large.json`: 13 experiences and 13 projects,
including 10 additional entries of each kind. All entries and metrics are synthetic;
overlapping dates include part-time and volunteer work. Verifies persistence,
all 26 profile cards in the browser, relevant 4/2 selection, complete PDF bullets,
one page, lower-page text placement and required keyword coverage. Outputs to
`artifacts/groq-large-audit/`. The fixture deliberately mixes relevant developer
tools work with less relevant Java, data and static-site work.

The existing full extension test also accepts `GROQ_PROFILE_FIXTURE` and
`GROQ_AUDIT_OUT` overrides for large-input investigations.

Six distinct additional JDs and reviewed real Groq PDFs:

```sh
GROQ_E2E=1 npm run test:e2e -- tests/e2e/six-jds.spec.ts -g 'six JDs: backend$'
```

Replace `backend` with `frontend`, `fullstack`, `sdet`, `data`, or `platform`.
Review each case before proceeding. Uses the same large synthetic profile;
requires the existing synthetic audit account. Fixtures: `tests/fixtures/jds/`.
Artifacts: `artifacts/six-jds/<role>/`. See `SIX-JD-AUDIT.md` for reviewed
results, the factuality/selection fixes, scope and limitations.

Whole-system follow-up coverage and fixes are documented in
`SYSTEM-AUDIT.md`. `system-audit.spec.ts` adds API/data-loss/export/security
regressions; `extension-boundaries.spec.ts` uses real unpacked Chromium extension
contexts without an AI key. Custom LaTeX PDF compilation now requires an OS
sandbox and cached Tectonic packages; see the report for deployment requirements.
