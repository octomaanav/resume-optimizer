# Six additional live Groq JD tests

Used the same synthetic Jordan Patel profile (13 experiences, 13 projects, 78 source bullets) for every case. Real Groq `openai/gpt-oss-120b` selected entries and rewrote bullets through the authenticated app API; actual app LaTeX compilation produced each PDF. No generation or PDF responses were mocked. No candidate facts were added to satisfy a JD. Only the isolated audit account was seeded.

Each case was run separately, followed by review of every final bullet against its source and inspection of its rendered PDF before progressing. Cases with discovered bugs were rerun. All six final selections differ, even where closely related roles share some entries.

## Final results

Every final PDF is one readable 11-point page with 4 experiences, 2 projects, 18 complete bullets and zero selected bullets omitted. All 39 checked required terms appear in both extracted PDFs and selected experience/project bullets. This is local coverage of explicit term lists, not a commercial ATS score or an assessment of hiring suitability.

| Role / PDF | Required terms, including body | Pages | Bullets omitted | Space below text | Source/image review |
|---|---:|---:|---:|---:|---|
| [Backend API Engineer](/Users/AtharvaBadgujar/resume-optimizer/artifacts/six-jds/backend/resume.pdf) | 7/7 | 1 | 0 | 31.2 pt | Passed |
| [Frontend React and Accessibility Engineer](/Users/AtharvaBadgujar/resume-optimizer/artifacts/six-jds/frontend/resume.pdf) | 6/6 | 1 | 0 | 49.6 pt | Passed |
| [Full Stack TypeScript Engineer](/Users/AtharvaBadgujar/resume-optimizer/artifacts/six-jds/fullstack/resume.pdf) | 7/7 | 1 | 0 | 30.4 pt | Passed |
| [QA Automation Engineer / SDET](/Users/AtharvaBadgujar/resume-optimizer/artifacts/six-jds/sdet/resume.pdf) | 6/6 | 1 | 0 | 50.0 pt | Passed |
| [Junior Python and SQL Data Engineer](/Users/AtharvaBadgujar/resume-optimizer/artifacts/six-jds/data/resume.pdf) | 6/6 | 1 | 0 | 62.0 pt | Passed |
| [Observability and Platform Engineer](/Users/AtharvaBadgujar/resume-optimizer/artifacts/six-jds/platform/resume.pdf) | 7/7 | 1 | 0 | 31.2 pt | Passed |

## Selections and gaps

### Backend API Engineer

Selected: Northstar Systems (synthetic), Cedar Observability (synthetic), Willow Infrastructure Lab (synthetic), Harbor Labs (synthetic), TraceBoard, QueueLens.

Unsupported preferred tools correctly absent: Kafka.

Passed on final guard: all 18 bullets compared to source; exact attribution and metrics preserved. Image reviewed: full readable page, no clipping/overlap.

### Frontend React and Accessibility Engineer

Selected: Harbor Labs (synthetic), Maple Community Network (synthetic), Aspen Accessibility Group (synthetic), Cedar Observability (synthetic), Accessible Course Planner, ReleaseWatch.

Unsupported preferred tools correctly absent: Vue.

Passed: all 18 bullets compared to source; invented compliance and ARIA claims absent in final output. Image reviewed: full readable page, no clipping or overlaps. Fourth experience is backend-adjacent TypeScript, not purely frontend.

### Full Stack TypeScript Engineer

Selected: Northstar Systems (synthetic), Harbor Labs (synthetic), Cedar Observability (synthetic), Willow Infrastructure Lab (synthetic), TraceBoard, Accessible Course Planner.

Unsupported preferred tools correctly absent: GraphQL.

Passed: 18 final bullets compared to source; two conservative fallbacks preserved original wording. Image reviewed: full page, complete text, no overlap/clipping.

### QA Automation Engineer / SDET

Selected: Harbor Labs (synthetic), Cedar Observability (synthetic), Maple Community Network (synthetic), Aspen Accessibility Group (synthetic), Accessible Course Planner, TraceBoard.

Unsupported preferred tools correctly absent: Cypress.

Passed: all 18 final bullets compared to source; six conservative fallbacks, complete tests and metrics retained. Image reviewed: full readable page without overlap/clipping.

### Junior Python and SQL Data Engineer

Selected: Campus Computing Lab (synthetic), Birch Retail Lab (synthetic), Pine Open Data Group (synthetic), Willow Infrastructure Lab (synthetic), Weather Notebook, Budget Sandbox.

Unsupported preferred tools correctly absent: Snowflake, Airflow.

Passed: all 18 bullets match source facts, no invented warehouse/orchestration tools. Data-focused selection differs substantially from web roles. Image reviewed: full readable page with sensible whitespace, no clipping/overlap.

### Observability and Platform Engineer

Selected: Northstar Systems (synthetic), Cedar Observability (synthetic), Willow Infrastructure Lab (synthetic), Oak Student Services (synthetic), TraceBoard, QueueLens.

Unsupported preferred tools correctly absent: Kubernetes, Terraform.

Passed: all 18 bullets compared to sources and image reviewed with no clipping/overlap. Required-evidence fix selected Linux support instead of redundant UI work. All required terms now appear in experience/project bullets; Kubernetes and Terraform absent.

## Bugs found and changes

1. **Cross-employer fact leakage:** the initial backend output assigned Redis/Node.js/Docker caching to an HTML/CSS website-maintenance role. Existing numeric checks missed the number-free claim. Added entry-specific technology checks and regression coverage; unsupported rewrites fall back to the source bullet.
2. **Invented implementation and outcome claims:** the initial frontend output added ARIA labels, compliance assertions and form-submission improvements absent from the source. Added conservative per-bullet content-word validation, retaining original wording when novel details appear. Tightened prompts to keep bullet order, preserve attribution, and avoid invented outcomes. Tests cover compliance and unsupported benchmark gains.
3. **Required evidence left out of selection:** the first platform selection left Linux only in Skills despite available Linux work. Prioritized collective coverage of required qualifications in source bullets; the rerun selected Oak Student Services and supplied actual Linux evidence. The regression asserts body coverage as well as whole-document coverage.
4. Updated extension warning wording from unsupported metric rewrites to unsupported rewrites so it also describes non-numeric fallbacks.
5. Updated the persistence-test provider fixture to use a source-supported rewrite (Developed services 2). The old fixture invented the adjective dependable, which the new conservative guard correctly rejected. Persistence remains asserted; factuality has dedicated rejection tests.

## Scope and limits

These six new cases exercise authenticated persistence → live generation → selection validation → real PDF compilation → extraction/rendering → source/image review. The Chrome extension UI and job-application autofill were not rerun for all six JDs. Earlier extension test artifacts remain separate.
The previously caught application-essay TTL invention remains unresolved. The new guard applies to resume bullets, not essay generation.
The fact guard is deliberately conservative: it may retain an original bullet even when a proposed paraphrase is valid. It checks numbers, known technology attribution and novel content words; it is not a complete semantic verifier and cannot prove every possible claim true. Manual source review was performed on these final outputs.
Selection retains four roles and two projects and exports them in chronological order. Some selected roles are adjacent rather than exact fits. This synthetic profile already contains the required technologies, so complete local keyword coverage does not demonstrate an improvement over baseline or guarantee screening success.
Each artifact directory includes resume.pdf, preview-1.png, resume.txt, bbox.html, generation.json, source-comparison.json and results.json. Fixtures live in tests/fixtures/jds/.

## Rerun

Run one case at a time and review it before proceeding:

```sh
GROQ_E2E=1 npm run test:e2e -- tests/e2e/six-jds.spec.ts -g "six JDs: backend$"
```

Replace backend with frontend, fullstack, sdet, data or platform. A running dev server, database, seeded audit account and server-side GROQ_API_KEY are required. Never expose the key.

## Validation

All six live Groq cases passed individually after review and relevant fixes;
backend and platform were rechecked after the final guard/selection changes.
The final non-live regression run passed 28 tests with 14 opt-in tests skipped
(including the six live cases run separately). Lint and TypeScript checks passed.
The application-essay factuality issue remains open and is not included in these
resume-specific passing results.


Follow-up: see [SYSTEM-AUDIT.md](SYSTEM-AUDIT.md) for subsequent fixes to the observed essay factuality issue, export overflow, extension boundaries and persistence failures. The unresolved-issue statements above describe the earlier audit state.


Latest recheck: see [RECHECK.md](RECHECK.md). Current six-JD artifacts were refreshed after correcting a data-role selection regression; the historical measurements above describe their earlier runs.
