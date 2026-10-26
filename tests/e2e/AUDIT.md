# Resume optimizer audit — 2026-10-21

Tested the actual Next.js/Drizzle/Postgres/Auth.js implementation using installed Chrome and local Postgres. Existing `.env.local` had the required database URL and auth secret. `npm install` and `npm run db:push` succeeded; schema sync reported no changes. CLAUDE.md was not edited. The four initial modified files and concurrent visual changes were preserved.

## Cases

| Case | Coverage |
| --- | --- |
| 1 | Profile persistence/rendering: 18 roles, five projects, Unicode/emoji and a roughly 7 KB bullet |
| 2 | Partial experience/project selection, save and reload |
| 3 | Resume-only customizations, profile isolation and matching TeX |
| 4 | Raw custom LaTeX save/reload, real PDF compilation and generated-mode restoration |
| 5 | Read-only legacy Markdown and a multi-thousand-word legacy JD |
| 6 | skills.md upload, personal context, provider persistence, keyboard upload, provider/theme arrow keys |
| 7 | Unavailable Ollama returns an actionable 502 |
| 8 | Invalid model response shapes rejected across all generation modes |
| 9 | XYZ browser flow, modal focus wrapping, accepting and database persistence |
| 10 | Cover-letter browser generation, large JD and unchanged base template |
| 11 | Q&A browser generation, database persistence and Escape behavior |
| 12 | Resume selection → bullet optimization → persisted result, preserving base document |
| 13 | 320 px viewport across home, profile, document lists/editors/new pages, optimize pages, settings and auth pages |
| 14 | Concurrent workspace patches and cryptographically signed, expired JWT rejection |
| 15 | Session expires during Settings save: visible error, no false Saved indicator |
| 16 | Reordered source entries, reverse chronological output and strict empty selections |
| 17 | Cross-tab save and visibility refresh |
| 18 | Invalid request bodies, empty required inputs and invalid typed model output |
| 19 | Selection preview uses profile facts, deduplicates IDs and rejects unknown IDs |
| 20 | Signed-out callers cannot invoke AI generation or probe Ollama |
| 21–25 | Real local Qwen inference for XYZ, cover letters, Q&A, resume selection and resume bullets |

Browser generation regressions use an in-process Ollama protocol fixture, exercising the real browser → API → provider protocol → Postgres → UI path. Cases 21–25 separately use actual `qwen2.5:1.5b` inference through `/api/ai/generate`, without a fixture. Generated JSON is attached to the inference test results.

## Bugs fixed

- Mobile dock overflow; a later header regression from concurrent visual edits also overflowed at 320 px. The header now uses its compact layout on narrow screens.
- Unlabeled settings textareas and a file input removed from keyboard navigation.
- Missing arrow-key behavior and roving tab stops in provider/theme radio groups.
- Optimization overlays lacked dialog semantics, initial focus and reliable Tab wrapping. Native modal dialogs now provide semantics, background inertness and focus restoration, with explicit Tab-boundary handling.
- Settings failed saves produced unhandled errors with no visible feedback. Save now reports errors, handles expired sessions, clears stale success state and prevents duplicate submissions.
- AI routes accepted empty or incorrectly typed model JSON as success. Responses are now checked before rendering/persistence.
- Resume selection Markdown invented dates and links. The server now renders this selection-stage preview directly from profile records, rejects unknown selected IDs, and fills omitted selection slots from recent profile entries while preserving the model ranking. AI remains responsible for selection and the subsequent bullet rewrite.
- A real small-model cover-letter response was a resume outline with placeholders. The prompt now explicitly requests a completed prose letter.
- A real Q&A response changed an 80 ms improvement into an incorrect 80% claim. The prompt now requires copying metrics rather than computing percentages, and omits past metrics for motivation questions.
- Generation and Ollama health were accessible without a session. Both now require authentication; extension requests include session cookies to match its existing authenticated database calls.

## Verification and limits

Final combined run: **25 passed in 1.3 minutes**, including all five real local-inference cases. Command: `OLLAMA_E2E_URL=http://127.0.0.1:11436 npm run test:e2e`.

`npm run lint`, `npx tsc --noEmit`, and `git diff --check` passed after the source fixes.

No Gemini key or OAuth credentials were available, so those external services were not tested. There is no password-change feature to test. The current resume editor's JD (legacy) panel only displays saved text; it has no separate generation action.

Real local-model review found weak prose and factual mistakes despite successful HTTP responses. Prompt improvements reduced the observed problems; the selection-stage factual fix is deterministic. These tests do not establish universal factual accuracy or production writing quality. Ollama also aborted a prediction with a token-repeat error and later repeated output until the temporary server was restarted. Generation now has a 4096-token output cap and a modest repetition penalty. Real-model prose can still be generic or include unfilled placeholders; it requires user review.

The audit used temporary Ollama binaries/models under `/private/tmp/resume-ollama`, serving on `127.0.0.1:11436`. No system Ollama app was installed. Ollama generated its standard local identity files on first start. The app remains on port 3000. Isolated synthetic audit accounts/documents remain in Postgres. The extension's cookie change was reviewed and covered by the authenticated API tests; a live installed-extension flow was not exercised.

See [README.md](README.md) for rerun commands. Avoid simultaneous Playwright invocations sharing the same test output directory. Restart Next.js if server/client markup becomes stale during concurrent edits.
