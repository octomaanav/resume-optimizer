"use client";

import { useState } from "react";
import { Save, Upload } from "lucide-react";
import { formatSavedBannerTime } from "../lib/format-date";
import { useHydratedSettings } from "../lib/use-hydrated-storage";
import { AiMagicIcon } from "../components/ai-magic-icon";

function extractSkillsFromMarkdown(md: string): string[] {
  return md
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- ") || l.startsWith("* "))
    .map((l) => l.replace(/^[-*]\s+/, "").trim())
    .filter(Boolean);
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

  const extracted = extractSkillsFromMarkdown(settings.skillsMd ?? "");

  if (!storageReady) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        Loading...
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="mt-2 flex gap-2 text-sm leading-relaxed text-muted">
            <AiMagicIcon size="sm" className="mt-0.5 shrink-0" />
            <span>
              AI runs in your browser via this app's API route. Choose Google
              Gemini or a local Ollama model.
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => void onSave()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-dark"
        >
          <Save size={14} />
          Save
        </button>
      </div>

      {savedAt ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
          Saved {formatSavedBannerTime(savedAt)}.
        </div>
      ) : null}

      <section className="rounded-2xl border border-border bg-surface-raised p-5">
        <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted">
          <AiMagicIcon size="sm" />
          AI provider
        </h2>
        <div className="mt-4 flex flex-col gap-2.5">
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="radio"
              name="provider"
              checked={(settings.aiProvider ?? "gemini") === "gemini"}
              onChange={() =>
                setSettings((s) => ({ ...s, aiProvider: "gemini" }))
              }
              className="accent-accent"
            />
            Google Gemini (API key)
          </label>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input
              type="radio"
              name="provider"
              checked={settings.aiProvider === "ollama"}
              onChange={() =>
                setSettings((s) => ({ ...s, aiProvider: "ollama" }))
              }
              className="accent-accent"
            />
            Ollama (local)
          </label>
        </div>

        <div className="mt-5">
          {(settings.aiProvider ?? "gemini") === "gemini" ? (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Gemini API key</span>
              <input
                value={settings.geminiApiKey ?? ""}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, geminiApiKey: e.target.value }))
                }
                className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                placeholder="AIza..."
                autoComplete="off"
              />
              <span className="text-xs text-muted">
                Or set <code className="font-mono">GEMINI_API_KEY</code> on the
                server.
              </span>
            </label>
          ) : (
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Ollama base URL</span>
                <input
                  value={settings.ollamaBaseUrl ?? "http://127.0.0.1:11434"}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, ollamaBaseUrl: e.target.value }))
                  }
                  className="rounded-xl border border-border bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                  placeholder="http://127.0.0.1:11434"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium">Model name</span>
                <input
                  value={settings.ollamaModel ?? "llama3.2"}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, ollamaModel: e.target.value }))
                  }
                  className="rounded-xl border border-border bg-surface px-3 py-2 font-mono text-sm outline-none focus:border-accent"
                  placeholder="qwen2.5:latest"
                />
              </label>
              <p className="text-xs leading-relaxed text-muted">
                Run <code className="font-mono">ollama serve</code> locally. The
                server calls Ollama from your machine (same host as{" "}
                <code className="font-mono">next dev</code>). Use{" "}
                <code className="font-mono">OLLAMA_HOST</code> in env if needed.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface-raised p-5">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
          skills.md
        </h2>
        <p className="mt-2 text-sm text-muted">
          Optional context for prompts (resume, cover letter, Q&amp;A).
        </p>

        <label className="mt-4 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted hover:border-border-hover hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
          <Upload size={16} />
          Upload .md file
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
          value={settings.skillsMd ?? ""}
          onChange={(e) =>
            setSettings((s) => ({ ...s, skillsMd: e.target.value }))
          }
          rows={10}
          className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-accent"
        />

        <div className="mt-4 rounded-xl border border-border p-4 text-sm">
          <div className="font-medium">Detected bullets</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {extracted.length === 0 ? (
              <span className="text-muted">None yet.</span>
            ) : (
              extracted.slice(0, 40).map((s, idx) => (
                <span
                  key={`${s}-${idx}`}
                  className="rounded-full bg-accent-light px-2.5 py-1 text-xs text-accent"
                >
                  {s}
                </span>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface-raised p-5">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
          Personal context / About me
        </h2>
        <p className="mt-2 text-sm text-muted">
          The stuff a résumé can&apos;t hold — your interests, values, goals, and
          the stories behind your projects. AI answer generation uses this for
          forward-looking and idea questions, and to add depth and your real
          voice to experience answers.
        </p>
        <textarea
          value={settings.personalContext ?? ""}
          onChange={(e) =>
            setSettings((s) => ({ ...s, personalContext: e.target.value }))
          }
          rows={12}
          placeholder={`## What I care about\nAccessibility and sustainability — systems that take action in the real world, not just answer questions.\n\n## Project narratives (the story behind the bullets)\nUB Hacking CMS — the hard part wasn't building features, it was deciding what NOT to build. Every addition = maintenance cost for future teams...\n\n## Goals / what I want from opportunities\nSurrounded by builders who think differently; leave with new perspectives and a project that solves a real problem.`}
          className="mt-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm leading-relaxed outline-none focus:border-accent"
        />
      </section>
    </div>
  );
}
