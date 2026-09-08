"use client";

import { useState } from "react";
import {
  Check,
  Cpu,
  FileCode2,
  KeyRound,
  Save,
  Sparkles,
  Upload,
  UserRound,
} from "lucide-react";

import { formatSavedBannerTime } from "../lib/format-date";
import { useHydratedSettings } from "../lib/use-hydrated-storage";
import {
  Bento,
  ChoiceCard,
  Field,
  PageHeader,
  Stat,
  Tile,
  buttonPrimary,
  inputClass,
  inputMonoClass,
} from "../components/ui";

function extractSkillsFromMarkdown(md: string): string[] {
  return md
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- ") || l.startsWith("* "))
    .map((l) => l.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
}

function wordCount(text: string) {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

export default function SettingsPage() {
  const [settings, setSettings, storageReady, persistSettings] =
    useHydratedSettings();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function onSave() {
    await persistSettings(settings);
    setSavedAt(Date.now());
  }

  async function onImportSkillsMd(file: File) {
    const text = await file.text();
    setSettings((s) => ({ ...s, skillsMd: text }));
  }

  const provider = settings.aiProvider ?? "gemini";
  const skillsMd = settings.skillsMd ?? "";
  const personalContext = settings.personalContext ?? "";
  const extracted = extractSkillsFromMarkdown(skillsMd);
  const hasKey = Boolean(settings.geminiApiKey?.trim());

  if (!storageReady) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        Loading settings…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Choose which model writes your drafts, and give it the background it needs to sound like you."
        actions={
          <>
            {savedAt && (
              <span className="hidden items-center gap-1.5 text-xs text-success sm:inline-flex">
                <Check size={13} />
                Saved {formatSavedBannerTime(savedAt)}
              </span>
            )}
            <button type="button" onClick={() => void onSave()} className={buttonPrimary}>
              <Save size={14} />
              Save
            </button>
          </>
        }
      />

      <Bento>
        {/* ── AI provider ─────────────────────────────────────────────── */}
        <Tile
          span={4}
          title="AI provider"
          icon={<Sparkles size={15} />}
          description="Generation runs through this app's API route — the key never leaves your machine."
        >
          <div className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label="AI provider">
            <ChoiceCard
              selected={provider === "gemini"}
              onSelect={() => setSettings((s) => ({ ...s, aiProvider: "gemini" }))}
              icon={<KeyRound size={15} />}
              title="Google Gemini"
              description="Hosted. Needs an API key."
            />
            <ChoiceCard
              selected={provider === "ollama"}
              onSelect={() => setSettings((s) => ({ ...s, aiProvider: "ollama" }))}
              icon={<Cpu size={15} />}
              title="Ollama"
              description="Local model. Nothing leaves your machine."
            />
          </div>

          <div className="mt-4 border-t border-border pt-4">
            {provider === "gemini" ? (
              <Field
                label="Gemini API key"
                hint={
                  <>
                    Or set <code className="font-mono">GEMINI_API_KEY</code> on the server.
                  </>
                }
              >
                <input
                  value={settings.geminiApiKey ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, geminiApiKey: e.target.value }))
                  }
                  className={inputClass}
                  placeholder="AIza…"
                  autoComplete="off"
                  type="password"
                />
              </Field>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Base URL">
                  <input
                    value={settings.ollamaBaseUrl ?? "http://127.0.0.1:11434"}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, ollamaBaseUrl: e.target.value }))
                    }
                    className={inputMonoClass}
                    placeholder="http://127.0.0.1:11434"
                  />
                </Field>
                <Field label="Model">
                  <input
                    value={settings.ollamaModel ?? "llama3.2"}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, ollamaModel: e.target.value }))
                    }
                    className={inputMonoClass}
                    placeholder="qwen2.5:latest"
                  />
                </Field>
                <p className="text-xs leading-relaxed text-faint sm:col-span-2">
                  Run <code className="font-mono">ollama serve</code> locally — the
                  server calls it from the same host as{" "}
                  <code className="font-mono">next dev</code>.
                </p>
              </div>
            )}
          </div>
        </Tile>

        {/* ── At a glance ─────────────────────────────────────────────── */}
        <Tile span={2} title="At a glance" icon={<Check size={15} />}>
          <div className="mt-4 grid grid-cols-2 gap-4 lg:grid-cols-1">
            <Stat label="Skill bullets" value={extracted.length} />
            <Stat label="Context words" value={wordCount(personalContext)} />
          </div>

          <div className="mt-5 flex flex-col gap-2 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted">Provider</span>
              <span className="font-medium capitalize">{provider}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted">
                {provider === "gemini" ? "API key" : "Model"}
              </span>
              {provider === "gemini" ? (
                <span
                  className={`font-medium ${hasKey ? "text-success" : "text-danger"}`}
                >
                  {hasKey ? "Set" : "Missing"}
                </span>
              ) : (
                <span className="truncate font-mono text-[11px]">
                  {settings.ollamaModel ?? "llama3.2"}
                </span>
              )}
            </div>
          </div>
        </Tile>

        {/* ── skills.md ───────────────────────────────────────────────── */}
        <Tile
          span={3}
          title="skills.md"
          icon={<FileCode2 size={15} />}
          description="Optional context added to resume, cover letter and Q&A prompts."
          footer={
            <div className="flex flex-wrap gap-1.5">
              {extracted.length === 0 ? (
                <span className="text-xs text-faint">No bullets detected yet.</span>
              ) : (
                <>
                  {extracted.slice(0, 12).map((s, i) => (
                    <span
                      key={`${s}-${i}`}
                      className="rounded-full bg-accent-light px-2 py-0.5 text-[11px] text-accent-dark"
                    >
                      {s}
                    </span>
                  ))}
                  {extracted.length > 12 && (
                    <span className="px-1 py-0.5 text-[11px] text-muted">
                      +{extracted.length - 12} more
                    </span>
                  )}
                </>
              )}
            </div>
          }
        >
          <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-2.5 text-xs text-muted transition-colors hover:border-accent hover:bg-accent-light hover:text-accent-dark">
            <Upload size={14} />
            Upload a .md file
            <input
              type="file"
              accept=".md,text/markdown"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onImportSkillsMd(file);
              }}
              className="hidden"
            />
          </label>

          <textarea
            value={skillsMd}
            onChange={(e) => setSettings((s) => ({ ...s, skillsMd: e.target.value }))}
            rows={12}
            placeholder={"- TypeScript, React, Next.js\n- Postgres, Drizzle\n- CI/CD, Docker"}
            className={`${inputMonoClass} mt-3 resize-y leading-relaxed`}
          />
        </Tile>

        {/* ── Personal context ────────────────────────────────────────── */}
        <Tile
          span={3}
          title="Personal context"
          icon={<UserRound size={15} />}
          description="What a résumé can't hold — interests, values, goals, and the stories behind your projects."
          footer={
            <span className="text-xs text-faint">
              Used for forward-looking and idea questions, and to add your real voice
              to experience answers.
            </span>
          }
        >
          <textarea
            value={personalContext}
            onChange={(e) =>
              setSettings((s) => ({ ...s, personalContext: e.target.value }))
            }
            rows={17}
            placeholder={`## What I care about\nAccessibility and sustainability — systems that act in the real world.\n\n## Project narratives\nUB Hacking CMS — the hard part wasn't building features, it was deciding what NOT to build.\n\n## What I want next\nBuilders who think differently, and a project that solves a real problem.`}
            className={`${inputClass} mt-4 resize-y leading-relaxed`}
          />
        </Tile>
      </Bento>
    </div>
  );
}
