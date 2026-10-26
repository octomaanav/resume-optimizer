# Large synthetic profile audit

The isolated Jordan Patel test account now contains 13 work experiences and
13 projects, each with three source bullets (78 source bullets total). This adds
10 experiences and 10 projects to the original fixture. No real user's profile
was replaced. The additional roles are synthetic contracts, part-time,
research and volunteer work; their overlapping dates are test data.

Live Groq (`openai/gpt-oss-120b`) selected Northstar Systems, Harbor Labs,
Cedar Observability and Willow Infrastructure Lab, plus TraceBoard and
Accessible Course Planner. The selection passed relevance assertions against
the developer tools JD and excluded Java Chess Engine. All 26 entries were
verified both in Postgres-backed API persistence and on the profile page.

The final 11-point PDF is one page, contains all 18 complete selected bullets,
and omits zero selected bullets. PDF text ends at 760.82 points on a 792-point
page, leaving about 31 points below the text. The rendered page was visually
reviewed for clipping and whitespace. All 11 checked required technologies
appear in extracted text. This is local keyword coverage, not an external ATS
score. Two unsupported numerical rewrites were reverted by the existing guard.
AI qualitative wording still warrants factual review.

Artifacts: `artifacts/groq-large-audit/tailored.pdf`, `tailored.png`,
`generation.json`, `resume-results.json`, and `large-profile.png`.

The broader extension/autofill run on this expanded fixture separately exposed
an unresolved factuality issue: Groq invented cache TTL tuning in an application
essay despite instructions forbidding unsupported implementation details.
The existing assertion caught it; that full flow is not reported as passing.
The dedicated resume creation test passed independently.

During layout verification, the running Next dev server was still using the
older 10-point exporter. Restarting it loaded the current 11-point template;
the lower-page placement assertion then passed. Keep this server state issue
in mind when comparing generated artifacts to source edits.

Validation: dedicated live large-profile resume test passed; regression suite
26 passed / 8 opt-in cases skipped; `npm run lint`, `npx tsc --noEmit`, and
`git diff --check` passed. The separately attempted expanded full-extension
flow failed its factuality assertion as described above.


Follow-up: see [SYSTEM-AUDIT.md](SYSTEM-AUDIT.md) for subsequent fixes to the observed essay factuality issue, export overflow, extension boundaries and persistence failures. The unresolved-issue statements above describe the earlier audit state.
