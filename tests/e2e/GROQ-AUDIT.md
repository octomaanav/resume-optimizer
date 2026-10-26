# Groq and Chrome extension audit — 2026-10-25

The test uses the configured server-side Groq key without printing or copying it into artifacts. Live inference uses `openai/gpt-oss-120b`, verified as available through Groq's models API. No generation responses are mocked in the extension integration test.

## Scenario and result

A separate synthetic account (`groq-extension-cs@example.com`) contains Jordan Patel's complete CS profile: contact information, three links, a summary, four skill groups, three internships/research roles, three projects, and a CS degree with GPA, dates, location and coursework. The profile is seeded through authenticated APIs, verified in the UI, edited/saved through the UI, then synced by the real extension. Legal/relocation/consent answers are explicit saved test preferences.

The fake posting asks for a TypeScript/Node.js/React developer using PostgreSQL, Redis, Docker, AWS, GitHub Actions, OpenTelemetry and automated testing. Kubernetes and Go are preferred gaps; neither is invented in the resume.

The actual unpacked MV3 extension runs in Playwright Chromium with its service worker, content script and sidebar iframe. It scrapes a local Greenhouse-style application with 23 non-file controls plus a required PDF upload. No extension messaging or application API calls are mocked. Only the fake application HTML is supplied by the test browser's local route.

Verified in the successful full-flow runs:

- All 23 detected controls filled: identity/contact/links, city/state/country, school/degree/major/graduation/GPA, recent employer/title, explicit work preferences, two AI essays, and explicit consent.
- Essay limits respected: 500 and 800 characters.
- Real Groq selects the relevant three experiences and two projects; the unrelated Java chess project is excluded.
- Real LaTeX compilation creates a one-page PDF and the extension attaches that actual PDF file to the form.
- All required controls pass browser form validation, while the form submission counter stays **zero**.
- The repaired PDF retains all **15 complete bullets**, with zero whole bullets omitted in the verified run. Every retained bullet's complete normalized text is checked against extracted PDF text.
- PDF text includes name, email, education and experience and contains neither unsupported preferred technology.

Final combined verification: **27 passed, 5 skipped in 30.9 seconds**. The five skips are the prior Ollama-only live-inference cases; real Groq inference and both actual-extension cases passed. `npm run lint`, `npx tsc --noEmit`, and `git diff --check` also passed.

## ATS check

This is a transparent **local required-keyword coverage score**, not Jobscan, an employer's ATS ranking, or a universal ATS score. `pdftotext -layout` extracts the actual uploaded PDF; the test checks these 14 required terms:

TypeScript, Node.js, React, REST API, PostgreSQL, Redis, Docker, AWS, GitHub Actions, CI/CD, OpenTelemetry, Playwright, integration tests, accessible.

| Document | Required terms | Coverage |
| --- | --- | --- |
| Baseline PDF | 14 / 14 | 100 / 100 |
| Tailored PDF | 14 / 14 | 100 / 100 |

The score did not increase: this synthetic candidate already covers every required term. The meaningful improvements are job-relevant selection, concise wording, verified upload, complete PDF text, and factual safeguards—not artificial keyword stuffing or invented Kubernetes/Go experience. Full keyword lists and before/after details are saved in `artifacts/groq-audit/results.json`.

## Bugs fixed during testing

1. The app had no Groq provider and the extension forced Ollama. Groq now works through app Settings, server API, synced extension settings and single-field generation. Server keys stay out of prompts and responses.
2. Hero/all-fields autofill used only known templates and left new essays empty. It now generates missing prose answers through the configured provider, respecting field limits, while identity/legal/choice/consent values still require known facts or explicit saved preferences.
3. Text controls inherited unrelated consent/Submit options from their enclosing form. Textareas/plain inputs now correctly have no choice options.
4. Authorization/sponsorship defaults assumed Yes/No, and a missing LinkedIn URL was guessed from a name. Those assumptions are removed.
5. Education/location/employment mapping missed major, graduation year, GPA, separate city/state/country, and recent employer/title. These map from supplied data; ended jobs are not treated as current roles.
6. A single consent checkbox could not match an explicit saved Yes/No answer. It now handles explicit booleans without inferring agreement.
7. Short Groq TPM throttles immediately failed the pipeline. The server now makes at most two bounded retries for provider retry delays of at most 55 seconds, uses compact JSON prompts and low reasoning effort for GPT-OSS. Longer quotas remain visible errors; tests cover retry and key redaction.
8. Conflicting essay instructions encouraged fabricated narrative details. Prompts now allow concise factual paraphrases and explicitly prohibit invented implementation decisions and ambiguous claims about employment at the target company.
9. **PDF export silently chopped the ends of bullets** to remove short wrapped lines, deleting outcomes and producing sentence fragments. Rendering now preserves complete bullet text. If fitting requires omitting entire bullets, the extension displays the omission count. The fitter no longer reports a deletion that was never compiled on its last iteration.
10. Real resume output changed a 240→150 ms improvement into a new 40% claim. A deterministic numeric guard now preserves the original bullet if a rewrite introduces unsupported numerical values/percentages; equivalent formats such as 12k/12,000 remain allowed. Tests cover this both directly and through the real application API. In the final live Groq run, one unsupported numerical rewrite was reverted; all 15 retained bullets remained complete.
11. The extension PDF compiler lacked the session checks used by other document APIs. It now requires authentication; extension PDF requests include session cookies.
12. Fresh installs silently used an unrelated built-in sample identity. They now start empty and require a synced profile before AI generation. A fresh-install test verifies that identity, authorization, sponsorship and consent remain blank and no form is submitted.
13. The existing mobile regression caught a Q&A-card action row overflowing at 320 px; its buttons now wrap.

## Artifacts and rerun

Local artifacts (ignored by Git) are in `artifacts/groq-audit/`:

- `tailored.pdf`, `tailored.txt`: final uploaded resume and extracted text.
- `baseline.pdf`, `baseline.txt`: original PDF and extracted text.
- `generation.json`: selected IDs, rewritten bullets, numeric warnings and PDF fitting stats.
- `results.json`, `scrape.json`: assertions, field values, scores and detected control metadata.
- `profile.png`, `filled-application.png`: browser evidence.

With Postgres running and `npm run dev` on port 3000:

```sh
npx playwright install chromium
GROQ_E2E=1 npm run test:e2e
```

The five previous Ollama-specific live-inference cases are opt-in and skipped when `OLLAMA_E2E_URL` is unset. Existing browser/API regressions and deterministic Groq/provider/export checks run alongside the live Groq extension case.

## Limits

This verifies a realistic local fake application with native inputs, selects, textareas, checkbox and file upload. It does not prove compatibility with every live Workday/Ashby/Greenhouse custom widget or submit a real application. Generated essays still require factual and editorial review: numeric checks do not prove every qualitative claim. The ATS percentage measures the stated keyword coverage only; it does not guarantee employer acceptance. Synthetic data remains in its isolated test account. CLAUDE.md and the user's personal profile were not changed.
