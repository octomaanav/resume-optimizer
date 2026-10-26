# UI redesign and four review rounds

## Direction

The selected direction is an application workbench: stable navigation, readable document controls, and a quiet neutral canvas with an evergreen accent. The home page uses actual saved data and links back into the work. It does not invent application metrics or ATS scores.

I considered a marketing-led dashboard, an IDE imitation, and a quieter document workspace. The workbench fits the actual tasks best: assembling experience, maintaining reusable documents, tailoring one application, and reviewing the output. This is a design judgment, not a claim of user research or universal preference.

Research:
- [Carbon typography strategies](https://www.carbondesignsystem.com/building-blocks/foundations/typography/style-strategies): compact, consistent typography for active product tasks; larger typography used selectively.
- [Carbon spacing](https://v10.carbondesignsystem.com/guidelines/spacing/overview/): dense working regions with space between groups.
- [Primer app-like web experiences](https://www.primer.style/accessibility/design-guidance/app-like-web-experiences/): clear focus, navigation, and magnification support.
- [Primer accessibility](https://primer.style/accessibility/): accessibility as part of the design rather than a visual afterthought.

## Review 1 — structure and identity

Reviewed desktop home/profile and mobile/dark captures. Replaced the floating desktop dock with a persistent rail; mobile retains six labeled bottom navigation links. Replaced the promotional home banner with real profile counts, recent documents, and application entry points. Removed paper grain, glow, colored emoji icons, and inconsistent accent colors. Found long-title and profile overflow on mobile; continued rather than accepting the first pass.

## Review 2 — long content and navigation

Reviewed home, profile, library, questions, settings, and optimization screens. Fixed document-grid minimum widths and wrapping. Added profile section shortcuts, useful with the 13-experience/13-project synthetic candidate. Replaced purple gradient rewrite buttons with quiet controls. Remaining overflow traced to education inputs and link-card flex sizing. Moved visual verification to a production build after observing stale development styles.

## Review 3 — editing and theme fidelity

Reviewed the populated resume editor, tailoring entry point, library, mobile screens, and dark mode. Fixed profile input/card sizing; browser capture reported no mobile overflow. Kept resume preview paper white in both themes. Inspected computed text colors after an incomplete dark capture: ordinary text was correctly dark; metric highlights still had a separate dark-mode white override, which was removed. Standardized primary-button foreground colors for dark mode. Improved document-editor navigation state and delayed the two-column editor layout until sufficient width is available.

## Review 4 — final selection

Rechecked the production build across desktop, mobile, dark mode, authentication screens, and a 320px phone view. Regression tests exercise long names, 13 experiences/projects, saved document counts, document opening, profile anchors, skip-to-content, and dark preview contrast. Corrected the authentication header context from “Document editor” to the appropriate sign-in/account label and rechecked it. Final captures and results are under `artifacts/ui-review/round-4/` (ignored generated artifacts).

The workbench direction was retained because the same hierarchy works for an empty workspace, a returning user, a long profile, and a document editing session. The scope is the web app; the extension's own sidebar has not been visually redesigned.

## Verification

- Production build, lint, TypeScript, and diff whitespace checks pass.
- Full default end-to-end suite: **50 passed, 14 opt-in tests skipped** (56.9 seconds). After the final authentication-label correction, the focused UI suite passed **4/4**, including the new auth-context regression.
- Final visual capture: **no page errors or mobile overflow** across the eight reviewed workspace routes. Responsive regression checks also cover 320px, 768px, and 1440px widths.
- Live Groq/Ollama tests are opt-in and were not rerun for these presentation changes. Deterministic AI workflow checks, PDF compilation, auth/data protection, and extension boundary tests remain in the default run.

Reproduce screenshots against a running local app with the existing synthetic audit account:

```sh
UI_ROUND=4 node tests/ui-review.mjs
```

Run regressions:

```sh
npm run test:e2e
npm run lint
npx tsc --noEmit
npm run build
```
