# Career MCP

An AI-assisted resume, cover letter, and job-application toolkit — and, on top
of that, an **agent-native web app**: it exposes its own capabilities as
[WebMCP](https://github.com/webmachinelearning/webmcp) tools, so an AI agent
(ChatGPT's in-app browser, WebMCP-enabled Chrome, or the app's own built-in
agent chat) can tailor your resume, write a cover letter, answer application
questions, and fill out and submit a job application — end to end, from one
sentence, with your explicit OK before anything final happens.

## What it does

**As a resume tool:**

- **Profile** — one source of truth for your experience, projects,
  education, and skills.
- **Documents** — persistent base templates for resumes, cover letters, and
  application Q&A answers.
- **Optimize** — paste a job description, get a tailored resume, cover
  letter, or application answer, without ever overwriting your base
  templates.
- **Resume rendering** — resumes use the well-known "Jake's Resume" LaTeX
  template, compiled to a real PDF (via [Tectonic](https://tectonic-typesetting.github.io/)),
  with automatic bolding of quantified achievements.
- **Cloud sync** — optional Supabase + Google OAuth. Works fully guest/local
  if you don't configure it.

**As a WebMCP app** (see `/apply`):

- **8 agent-callable tools** registered via `document.modelContext`:
  `get_profile`, `list_documents`, `optimize_resume`, `export_resume_pdf`,
  `answer_application_question`, `optimize_cover_letter`,
  `fill_application_field`, `submit_application`.
- A **live tool console** — every registered tool, its schema, a manual
  "run it yourself" form, and a real-time activity feed of every call any
  agent makes (the same thing Chrome DevTools' WebMCP panel shows, built
  into the product itself).
- A **built-in agent chat** ("Apply for me") that autonomously chains those
  tools end-to-end from one prompt — reads your profile, tailors your
  resume, writes a cover letter, answers the application questions, fills
  out a realistic ATS-style application form, and **pauses for your explicit
  confirmation** before the one irreversible step (`submit_application`).
- Runs against **Gemini, Groq, or a local model** (LM Studio / Ollama /
  anything OpenAI-compatible), with automatic fallback across all three if
  one is rate-limited or down.

## Tech stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **Tailwind CSS v4**
- **Zod v4** for schema validation everywhere data crosses a boundary
- **Supabase** (Postgres + Auth) — optional; the app degrades gracefully to
  local/guest mode without it
- **Google Gemini**, **Groq**, or any **OpenAI-compatible local model** for
  generation and agent tool-calling
- **node-latex-compiler** (Tectonic) for PDF generation
- **WebMCP** (`document.modelContext`) for agent tool-calling

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create `.env.local` in the project root:

```bash
# Supabase (optional — the app works guest-only without these)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# At least one AI provider is required for generation and the agent chat
GEMINI_API_KEY=your-gemini-key       # https://aistudio.google.com/apikey (free tier)
GROQ_API_KEY=your-groq-key           # https://console.groq.com (free tier)

# Optional: point the agent chat at a local OpenAI-compatible server
# (LM Studio, Ollama, etc.) instead of / in addition to the above
LOCAL_LLM_BASE_URL=http://127.0.0.1:1234/v1
LOCAL_LLM_MODEL=your-local-model-id
LOCAL_LLM_API_KEY=
```

If you're using Supabase, apply the schema in `supabase/migrations/` to your
project (see [Database migrations](#database-migrations) below), and set up
a Google OAuth provider in the Supabase dashboard — this app signs in with
Google only, no email/password.

### 3. Run it

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Trying the WebMCP demo

1. **Fill in your Profile** (`/profile`) — a job title, a bullet or two, some
   skills. The agent tools work off real data.
2. **Enable WebMCP in your browser** — either:
   - Chrome: visit `chrome://flags/#enable-webmcp-testing`, enable it,
     relaunch, or
   - Open the deployed URL in **ChatGPT's in-app browser**, which supports
     WebMCP natively.
3. **Go to `/apply`.** You'll see:
   - **Apply for me** — a chat box. Paste a job description and ask it to
     apply; watch the fields fill in live and it stop for your confirmation
     before submitting.
   - **Developer tools** (collapsed by default) — every tool listed with its
     schema, a form to run any of them manually, and a live activity feed.
4. To test without a browser that supports WebMCP yet, use the manual
   console in **Developer tools** — it calls the same
   `document.modelContext.executeTool` API the browser would.

## Database migrations

Schema changes are managed via the Supabase CLI (a dev dependency).

```bash
npm run db:link      # one-time: link the CLI to your Supabase project
npm run db:push       # apply all pending migrations
npm run db:status     # see what's applied vs. pending
npm run db:new -- <name>   # create a new migration
```

Migrations live in `supabase/migrations/` and are idempotent
(`create table if not exists`, etc.), so re-running them is safe.

## Project structure

```
app/
  lib/profile-model.ts       Profile schema (source of truth for background)
  lib/document-schemas.ts    Resume/cover letter/Q&A/workspace schemas
  lib/jake-latex.ts          Resume → LaTeX renderer
  lib/webmcp/                WebMCP tool definitions, activity log, apply-form state
  api/ai/generate/           Single AI generation endpoint (Gemini/Groq/Ollama)
  api/agent/chat/            Tool-calling proxy for the built-in agent chat
  api/latex/pdf/             LaTeX → PDF compilation
  apply/                     The WebMCP live demo page, agent chat, tool console
  optimize/                  Resume / cover letter / Q&A tailoring flows
supabase/migrations/         Idempotent SQL schema migrations
chrome-extension/            A companion Chrome extension for autofilling
                              applications directly on job boards (separate
                              from WebMCP — see note below)
```

## A note on the Chrome extension

`chrome-extension/` predates the WebMCP work and does something related but
different: it scrapes and autofills job application forms directly on
third-party sites (Workday, Greenhouse, etc.) via DOM injection. WebMCP tools
only ever run on pages that register them — they can't reach into someone
else's site — so the extension and the WebMCP integration are two separate,
complementary mechanisms, not the same thing.

## License

MIT — see [LICENSE](./LICENSE).
