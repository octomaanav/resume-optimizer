# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # Start dev server (Next.js 16 + Turbopack) on localhost:3000
npm run build    # Production build
npm run lint     # ESLint
```

No test framework is configured.

## Database migrations

The project uses the Supabase CLI (installed as a devDependency) for schema management. The remote project ref is `kkrdvqecmhfcoyajjkjl`.

### One-time setup (per machine)

```bash
npm run db:link          # Links local CLI to the remote project — prompts for DB password
```

The DB password is in Supabase dashboard → Project Settings → Database → Connection string.
The link state is stored in `supabase/.temp/` (gitignored).

### Daily workflow

```bash
npm run db:status        # Show which migrations are applied locally vs remotely
npm run db:push          # Apply all pending local migrations to the remote DB
npm run db:pull          # Pull schema changes made in Supabase dashboard into a new migration file
npm run db:diff          # Preview the SQL diff between local schema and remote (dry-run)
```

### Creating a new migration

```bash
npm run db:new -- <name>
# example: npm run db:new -- add_cover_letter_table
# Creates: supabase/migrations/<timestamp>_<name>.sql
```

Edit the generated file, then run `npm run db:push` to apply it.

### Rules

- **Never edit an already-pushed migration file.** Create a new one instead.
- All migrations must be idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) so they survive accidental re-runs.
- Every migration file starts with `-- migration: <filename>` and a one-line description.
- Run `npm run db:status` before `db:push` to confirm what will be applied.
- If you changed the DB schema directly in the Supabase SQL editor (outside a migration), run `npm run db:pull` immediately to capture it as a migration file.

## Architecture

Next.js 16 App Router application (React 19, Tailwind CSS v4) for creating and AI-optimizing resumes, cover letters, and application Q&A answers.

### Data flow

- **Profile** (experience, projects, education, skills) is the single source of truth for a user's background. Defined by `ProfileSchema` in `app/lib/profile-model.ts`.
- **Documents** (resumes, cover letters, Q&A templates) are persistent base templates. Schemas in `app/lib/document-schemas.ts`.
- **Optimize** pages take a base document + job description, call the AI API route, and produce a tailored output without modifying the base document.
- **Workspace** wraps all documents, settings, and optimization results into one payload (`WorkspacePayload` in `document-schemas.ts`). Loaded/saved via `WorkspaceProvider` context (`app/lib/workspace-context.tsx`).

### Storage layer

- When Supabase is configured (env vars), data persists to the database via `/api/database/workspace/me` (full workspace JSON in a `workspace` JSONB column) and `/api/database/profiles/me`.
- When Supabase is not configured, the app still works — `WorkspaceProvider` falls back gracefully (guests get defaults).
- `app/lib/use-hydrated-storage.ts` provides React hooks (`useHydratedResumes`, `useHydratedCoverLetters`, etc.) that read from the workspace context.

### Auth

- Optional Supabase + Google OAuth. Middleware (`middleware.ts`) redirects unauthenticated users to `/login` for non-public paths. Public paths: `/`, `/login`, `/auth/*`, `/api/*`, `/_next/*`.
- When Supabase is not configured (`isSupabaseConfigured()` returns false), auth is skipped entirely.

### AI integration

- Single API route at `app/api/ai/generate/route.ts` handles all AI generation (resume, cover letter, Q&A, profile bullet rewriting).
- Supports Google Gemini (API key) or local Ollama. Provider choice + credentials sent via request headers (`x-ai-provider`, `x-gemini-api-key`, `x-ollama-*`), built by `buildAiHeaders()` in `app/lib/ai-client.ts`.

### Resume rendering

- Resumes use the "Jake" LaTeX template. `app/lib/jake-latex.ts` generates `.tex` from profile data.
- Per-resume overrides (`ResumeOverrides` in `document-schemas.ts`) allow customizing text for a specific resume without editing the global profile.
- Subset selection: resumes can include only specific experience/project entries from the profile (`subsetEnabled` + ID lists).
- PDF compilation via `node-latex-compiler` at `/api/latex/pdf`.

### Navigation

- Bottom dock nav bar in `app/app-shell.tsx` with routes: Home, Profile, Documents, Q&A, Optimize, Settings.

### Key conventions

- All Zod schemas live in `app/lib/document-schemas.ts` and `app/lib/profile-model.ts`. Use `z.parse()` for validation.
- `app/lib/storage.ts` is deprecated — it re-exports from `document-schemas.ts`.
- Supabase env vars can be placed in `app/.env` (merged by `next.config.ts`) or project root `.env`.
- Supabase migrations are in `supabase/migrations/`. Use `npm run db:new` to create them, `npm run db:push` to apply. Never copy-paste SQL manually into the Supabase SQL editor for schema changes.
