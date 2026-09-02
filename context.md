# Project context & change history

Living notes for this repo: product behavior, user-driven changes, and technical decisions. Update when behavior or scope shifts.

## Product overview

Local-first **resume / cover letter / application Q&A** assistant (Next.js). Profile data and document templates live in `localStorage`. **Optimize** flows paste a **job description (JD)** and call `/api/ai/generate` (Gemini or Ollama) without overwriting base templates unless the user saves over them.

## AI & API (`app/api/ai/generate/route.ts`)

- **Kinds**: `resume` (select + bullets modes), `coverLetter`, `applicationAnswer`, `profileBullet`.
- **Ollama**: JSON mode, `stripThinkingAndNoise` for Qwen-style `<think>` blocks.
- **Profile bullet (`profileBullet`)**: Single-bullet rewrite, **no JD**. Prompt enforces **Google XYZ** framing: *Accomplished [X] as measured by [Y], by doing [Z]*, with strict rules against inventing metrics.

## Resume optimize (`app/optimize/resume/page.tsx`)

- Stage 1: AI selects experiences/projects; UI shows **which** items were selected (`SelectionSummary`).
- Stage 2: Explains **what bullet optimization does**; optional **diff vs profile** after overrides.
- **PDF**: `POST /api/latex/pdf` compiles LaTeX with **node-latex-compiler** (Tectonic); Jake TeX guarded for Tectonic (`pdfgentounicode`, `glyphtounicode`).

## Cover letter & Q&A templates

- **Cover letter**: Base docs + `/optimize/cover-letter?baseId=`. Hub link without `baseId` shows **picker** (like resume).
- **Application Q&A**: Templates (`ApplicationAnswerDoc`: title, question, `templateAnswer`); optimizations keyed by template id. **Legacy** `applicationQuestions` migrates once into `applicationAnswerDocs`. List/new/detail + `/optimize/application-question`.

## Storage keys (`app/lib/storage.ts`)

See `KEYS` in storage module: profile, resumes, cover letters, optimizations, application answer docs/optimizations, settings.

## User-requested changes (chronological themes)

| Area | Ask | Outcome |
|------|-----|--------|
| Resume stage 1 | Show selected experiences/projects, not only “optimized” | `SelectionSummary` on steps 2–3 |
| Resume stage 2 | Explain bullet optimization | Static explainer + “last run vs profile” line diff |
| PDF export | Real PDF from LaTeX, not full-page print | `/api/latex/pdf` + Tectonic; Jake TeX compatibility tweaks |
| Cover letter optimize | Missing `baseId` from hub | Picker when no query param |
| Q&A | Templates per answer + JD optimize | Docs model, optimize route, Documents + hub links |
| Profile | Per-bullet optimize, Google XYZ, general (no JD) | `profileBullet` kind + **XYZ optimize** buttons on experience/project bullets |
| Repo | `context.md` / memory of history | This file |

## Conventions for future work

- Prefer **matching existing patterns** (cover letter vs resume optimize) for new document types.
- **Do not invent metrics** in prompts; repeat in any new AI feature.
- Next.js version may differ from public docs; see `AGENTS.md` / `node_modules/next/dist/docs/` when APIs change.

_Last updated: 2026-04-08 (session: profile XYZ bullets + context file)._
