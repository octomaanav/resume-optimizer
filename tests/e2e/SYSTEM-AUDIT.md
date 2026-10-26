# Whole-system follow-up audit

Audited the actual Next.js / Drizzle / Postgres / Auth.js code and preserved
existing uncommitted work. CLAUDE.md was not edited. Tests use isolated synthetic
accounts and fake application pages; no application was submitted. No real
secrets were used in file-read probes.

## Bugs reproduced and fixed

| Area | Observed failure | Fix / verification |
|---|---|---|
| Settings | A skills.md-only patch reset Groq to Gemini and erased personal context. Zod defaults executed on omitted fields. | Remove defaults from the patch schema and merge settings fields. API regression preserves unrelated settings. |
| Signup concurrency | Two simultaneous registrations for the same email returned 201 and 500. | Database conflict handling returns 201 and 409. |
| Passwords | An 80-byte Unicode password was accepted despite bcrypt's 72-byte truncation limit. | New registrations reject passwords over 72 UTF-8 bytes, including multibyte input. Existing hashes/authentication format remain unchanged. |
| Profile loading | A 503 was swallowed and rendered as an empty profile with Save enabled. | Preserve the error, show an accessible retry panel, and pause editing until loading succeeds. Signed-out public pages retain their guest state. |
| Drafts on refresh | Returning to a tab replaced an unsaved name with cloud data. | Reconcile against the last cloud snapshot and retain dirty local fields. |
| Drafts during save | A completed save could overwrite text typed while the request was pending. | Apply the response only if the local profile still matches the submitted snapshot. Workspace saves also reconcile fields and serialize their requests. |
| Save status | A rejected profile save still displayed Saved and could flash per-card success. | Emit success only after persistence succeeds; failed saves retain errors and edits. |
| PDF overflow | A multi-page result was returned as a successful one-page export even when fitting failed. | Return 422 with page/omission information and a request to reduce content. |
| Entry identity | Duplicate experience IDs were accepted, allowing ambiguous selection and bullet-map collisions. | Validate non-empty, section-unique experience/project/education/skill-group IDs. |
| Custom LaTeX file access | Authenticated raw TeX compiled a document containing an absolute server-file canary. The --untrusted flag alone also allowed it. | OS-isolated compiler, restricted file reads/writes, network denied, application secrets removed from child environment, forced timeout/kill, per-job cleanup. A canary is denied while ordinary generated TeX still compiles. |
| Extension tab boundary | Autofill from sidebar A filled newly active tab B after the user switched tabs. | Relay to the sender's originating tab; reject messages without an identifiable origin. Verified in real Chromium with two fake forms. |
| Extension identity boundary | A page on untrusted.example.test set a legacy localStorage key and replaced the extension's cached identity. | Remove page-controlled legacy sync; only authenticated app/database sync supplies identity. Verified with the actual content script and service worker. |
| Essay facts | Live output invented TTL tuning, and later claimed scalability without additional hardware. | Reject unsupported cache-policy details. For past-work questions, conservatively retain source wording when a narrative adds unsupported details. Motivation/idea answers remain separate. Regression covers invented hardware/scaling claims and too-small fields. |

## Security implementation and deployment requirements

`app/lib/latex-compiler.ts` uses macOS sandbox-exec locally and supports a Linux
bubblewrap path when `/usr/bin/bwrap` is installed. Platforms without an OS
sandbox fail closed with 503. The Linux path was not exercised in this macOS
environment. Cached Tectonic packages are required: raw custom documents cannot
download arbitrary resources. A document requiring unavailable packages returns
an actionable error; it does not silently receive unrestricted compilation.

The compiler uses a 20-second timeout with SIGKILL and a bounded output buffer.
Its working directory is removed after each job. macOS permits system resources,
approved cached LaTeX resources, the compiler binary directory and the per-job
directory. Parent directory discovery is permitted without granting reads of
unapproved files contained in those directories.

Tectonic documents the narrower guarantees of its untrusted flag in its
[official security discussion](https://tectonic-typesetting.github.io/book/latest/v2cli/compile.html#security).
The harmless absolute-file probe confirmed that OS isolation was necessary here.

Production runtime verification also caught a setup omission: without a canonical
`AUTH_URL`, self-hosted production Auth.js rejected login with `UntrustedHost`.
The environment example now includes the local canonical URL and instructs
production deployments to use their deployed HTTPS origin. Host checks were not
blanket-disabled. Production verification sets the local URL explicitly.

## Coverage and limitations

New system cases cover settings patch preservation, signup races, password byte
limits, load failure, unsaved refresh, failed-save status, in-flight edits,
PDF overflow, duplicate IDs, user-ID spoofing rejection, the file-read canary and
a successful ordinary PDF. Two installed-extension tests cover cross-tab writes
and untrusted-page identity poisoning. Existing regression coverage checks
selection/customization, custom LaTeX, Markdown, Q&A/cover letters, settings,
expired sessions, cross-tab updates and 320px layouts.

Live Groq/extension verification uses the same 13-experience, 13-project fixture,
23 non-file fields and a PDF upload on a fake form. The baseline PDF now uses an
explicit 4/2 subset: exporting all 26 entries must not be treated as a successful
one-page baseline after the overflow fix.

The essay/source-word guards are conservative safeguards, not complete semantic
fact verification. They can preserve original wording instead of accepting a
valid paraphrase. Forward-looking answers and all AI output still warrant review.
OAuth and live Gemini were not tested because no corresponding credentials were
configured. Linux sandbox behavior and new uncached LaTeX packages were not tested.
The six distinct JD tests from the prior audit remain separate artifacts; they
are not claimed as freshly rerun in this audit.

## Reproduce

```sh
npm run build
AUTH_URL=http://localhost:3000 npm run start
npm run test:e2e
GROQ_E2E=1 GROQ_PROFILE_FIXTURE=tests/fixtures/cs-candidate-large.json GROQ_AUDIT_OUT=artifacts/system-audit-live npm run test:e2e -- tests/e2e/groq-extension.spec.ts
npm run lint
npx tsc --noEmit
```

Restart a dev process after switching between build and dev output if it serves
stale modules or 404s. Final verification uses the production server to avoid
that development-cache state.

## Final verification results

- Final production build: passed.
- Production runtime: running on localhost:3000 with explicit local AUTH_URL.
- `npm run test:e2e`: **44 passed, 14 opt-in cases skipped**, 30.8 seconds.
- Live Groq + actual unpacked extension on the production build: **2 passed**,
  50.7 seconds, using the 13-experience/13-project profile.
- The live run filled 23 non-file controls, attached the actual PDF, validated
  required fields, and verified zero submissions. The challenge essay used
  source-backed wording without the invented hardware/scaling outcome.
- Final live PDF: one page, zero selected bullets omitted, two conservative
  bullet rewrites restored. Local required-keyword coverage was 14/14 for both
  baseline and tailored PDFs; no external ATS score is claimed.
- `npm run lint`, `npx tsc --noEmit`, and `git diff --check`: passed.
- Artifacts: `artifacts/system-audit-live/` (PDF, extracted text, screenshot,
  generation JSON and result report).

These results supersede the prior reports' note that the observed TTL essay
failure had no guard. The targeted cache-policy check and conservative past-work
source fallback now exist and have regression coverage; broader semantic
factuality remains a review responsibility.


Latest recheck: see [RECHECK.md](RECHECK.md). Current six-JD artifacts were refreshed after correcting a data-role selection regression; the historical measurements above describe their earlier runs.
