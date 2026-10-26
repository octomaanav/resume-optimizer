# Full recheck after system audit

Final production build: 61 checks, **56 passed / 5 live-Ollama cases skipped**, 4.4 minutes. Live Groq was enabled for the actual unpacked Chrome extension, the large profile, and all six additional JDs. Build, lint, TypeScript and diff whitespace checks passed.

## Failure found and corrected

The first run stopped on the data-engineering selection check: the model chose Weather Notebook plus CacheBench, omitting the stronger Python/SQL Budget Sandbox project. The original relevance assertion was retained. Automatic selection now scores source bullets/project technologies against explicit required qualifications, gives extra weight to technologies in the role title, and uses model ordering to break ties. Preferred tools are parsed separately. Unstructured JDs preserve model selection. Newly selected entries use their original source bullets when the model did not supply rewrites; user-controlled manual subsets are unchanged.

Three regressions verify the observed Python/SQL selection failure, preferred-versus-required ranking, and distinct C/C++/C# matching. After this fix, the entire live-enabled suite was rerun on a fresh production build.

## Resume results

The same synthetic profile contains 13 experiences, 13 projects and 78 source bullets. Every final JD PDF has 4 experiences, 2 projects, 18 complete bullets and zero selected bullets omitted. Source comparisons and rendered images were reviewed. All 39 listed required terms appear in the selected work as well as the PDFs; this is local keyword coverage, not an external ATS score.

| Role / current PDF | Required terms in work bullets | Pages | Complete bullets | Omitted |
|---|---:|---:|---:|---:|
| [Backend API Engineer](/Users/AtharvaBadgujar/resume-optimizer/artifacts/six-jds/backend/resume.pdf) | 7/7 | 1 | 18 | 0 |
| [Frontend React and Accessibility Engineer](/Users/AtharvaBadgujar/resume-optimizer/artifacts/six-jds/frontend/resume.pdf) | 6/6 | 1 | 18 | 0 |
| [Full Stack TypeScript Engineer](/Users/AtharvaBadgujar/resume-optimizer/artifacts/six-jds/fullstack/resume.pdf) | 7/7 | 1 | 18 | 0 |
| [QA Automation Engineer / SDET](/Users/AtharvaBadgujar/resume-optimizer/artifacts/six-jds/sdet/resume.pdf) | 6/6 | 1 | 18 | 0 |
| [Junior Python and SQL Data Engineer](/Users/AtharvaBadgujar/resume-optimizer/artifacts/six-jds/data/resume.pdf) | 6/6 | 1 | 18 | 0 |
| [Observability and Platform Engineer](/Users/AtharvaBadgujar/resume-optimizer/artifacts/six-jds/platform/resume.pdf) | 7/7 | 1 | 18 | 0 |

## Other verified paths

Profile persistence and draft preservation; settings patches; signup concurrency and password byte limits; protected API access and session expiry; resume subsets, customization, raw LaTeX and legacy Markdown; cover-letter/Q&A workflows; mobile widths; keyboard dialogs; PDF overflow and server-file isolation; extension wrong-tab prevention and website-controlled profile injection prevention.

The live extension run filled 23 non-file controls on a fake application, generated answers, created and attached the real PDF, validated required fields and verified no submission. The profile remained synthetic and isolated from real user data. Fresh-extension behavior passed separately. Live artifacts: `artifacts/recheck-live/`.

## Limits

Five real Ollama inference cases were skipped because no Ollama server was running. The unavailable-Ollama error path passed. OAuth, live Gemini and Linux/bubblewrap execution were not exercised in this macOS environment. Custom LaTeX still requires an OS sandbox and cached packages. AI safeguards and literal required-term ranking do not establish complete semantic correctness or hiring suitability. No claim is made that all possible inputs, providers or deployment platforms have been verified.

## Command

```sh
GROQ_E2E=1 GROQ_PROFILE_FIXTURE=tests/fixtures/cs-candidate-large.json GROQ_AUDIT_OUT=artifacts/recheck-live npm run test:e2e
```

The production server is running at localhost:3000 with `AUTH_URL=http://localhost:3000`. Existing uncommitted changes were preserved; CLAUDE.md was not edited.
