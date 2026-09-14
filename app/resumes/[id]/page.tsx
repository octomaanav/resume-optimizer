"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { ResumeDoc, ResumeOverrides } from "../../lib/document-schemas";
import { emptyResumeOverrides } from "../../lib/document-schemas";
import { mergeProfileForResume } from "../../lib/merge-profile-for-resume";
import {
  resumeFilteredExperience,
  resumeFilteredProjects,
} from "../../lib/resume-filter";
import { renderJakeResumeTex } from "../../lib/jake-latex";
import { fitResumeToPageLimit } from "../../lib/resume-pdf-fit";
import {
  useHydratedProfile,
  useHydratedResumes,
} from "../../lib/use-hydrated-storage";
import { AiMagicIcon } from "../../components/ai-magic-icon";
import { JakeResumePreview } from "./jake-preview";
import { sortedExperience, sortedProjects } from "../../lib/sort-profile";
import { ResumeCustomizePanel } from "./resume-customize-panel";

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function ResumeDetailPage() {
  const params = useParams();
  const id = String(params.id);

  const [profile] = useHydratedProfile();
  const [docs, setDocs, storageReady, persistResumes] = useHydratedResumes();
  const doc = useMemo(
    () => docs.find((d) => d.id === id) ?? null,
    [docs, id],
  );

  const [title, setTitle] = useState("");
  const [view, setView] = useState<
    "preview" | "customize" | "latex" | "markdown"
  >("preview");

  const [overridesDraft, setOverridesDraft] = useState<ResumeOverrides>(() =>
    emptyResumeOverrides(),
  );

  const [subsetEnabled, setSubsetEnabled] = useState(false);
  const [selExp, setSelExp] = useState<string[]>([]);
  const [selProj, setSelProj] = useState<string[]>([]);

  const [latexMode, setLatexMode] = useState<"generated" | "custom">(
    "generated",
  );
  const [customLatexDraft, setCustomLatexDraft] = useState("");

  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const pdfUrlRef = useRef<string | null>(null);

  const hydrateFromDoc = useCallback((d: ResumeDoc) => {
    setTitle(d.title);
    setSubsetEnabled(d.subsetEnabled ?? false);
    setSelExp([...(d.defaults?.experienceIds ?? [])]);
    setSelProj([...(d.defaults?.projectIds ?? [])]);
    setLatexMode(d.latexMode ?? "generated");
    setCustomLatexDraft(d.customLatex ?? "");
    setOverridesDraft(
      structuredClone(d.overrides ?? emptyResumeOverrides()) as ResumeOverrides,
    );
  }, []);

  const lastHydrateKey = useRef<string>("");
  useEffect(() => {
    if (!doc) return;
    const key = `${doc.id}:${doc.updatedAt}`;
    if (lastHydrateKey.current === key) return;
    lastHydrateKey.current = key;
    hydrateFromDoc(doc);
  }, [doc, hydrateFromDoc]);

  useEffect(() => {
    return () => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
    };
  }, []);

  const previewDoc = useMemo((): ResumeDoc | null => {
    if (!doc) return null;
    return {
      ...doc,
      subsetEnabled,
      defaults: { experienceIds: selExp, projectIds: selProj },
      overrides: overridesDraft,
    };
  }, [doc, subsetEnabled, selExp, selProj, overridesDraft]);

  const displayProfile = useMemo(() => {
    if (!previewDoc) return profile;
    return mergeProfileForResume(profile, previewDoc);
  }, [profile, previewDoc]);

  const generatedLatex = useMemo(() => {
    if (!doc) return "";
    return renderJakeResumeTex({
      profile: displayProfile,
      experienceIds: selExp,
      projectIds: selProj,
      subsetEnabled,
      title: title.trim() || doc.title,
    });
  }, [doc, displayProfile, selExp, selProj, subsetEnabled, title]);

  const effectiveLatex = useMemo(() => {
    if (latexMode === "custom" && customLatexDraft.trim()) {
      return customLatexDraft;
    }
    return generatedLatex;
  }, [latexMode, customLatexDraft, generatedLatex]);

  function persist(nextDoc: ResumeDoc) {
    const next = docs.map((d) => (d.id === nextDoc.id ? nextDoc : d));
    setDocs(next);
    void persistResumes(next);
  }

  function replacePdfUrl(next: string | null) {
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = null;
    }
    pdfUrlRef.current = next;
    setPdfObjectUrl(next);
  }

  async function compileLatexViaApi(tex: string): Promise<Uint8Array> {
    const res = await fetch("/api/latex/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latex: tex }),
    });
    const ct = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      let msg = `Compile failed (${res.status})`;
      if (ct.includes("application/json")) {
        const j = (await res.json()) as { error?: string; stderr?: string };
        const parts = [j.error, j.stderr?.trim()].filter(Boolean);
        msg = parts.join("\n\n").slice(0, 4000) || msg;
      } else {
        msg = (await res.text()).slice(0, 800) || msg;
      }
      throw new Error(msg);
    }
    return new Uint8Array(await res.arrayBuffer());
  }

  /**
   * Compiles to a PDF, shrinking bullets to keep it to one page. Custom
   * hand-edited LaTeX is compiled as-is — we can't safely trim raw text the
   * user wrote themselves.
   */
  async function buildFittedPdf(): Promise<{
    bytes: Uint8Array;
    bulletsDropped: number;
  }> {
    if (latexMode === "custom" && customLatexDraft.trim()) {
      const bytes = await compileLatexViaApi(customLatexDraft);
      return { bytes, bulletsDropped: 0 };
    }
    const fitted = await fitResumeToPageLimit({
      profile: displayProfile,
      experienceIds: selExp,
      projectIds: selProj,
      subsetEnabled,
      title: title.trim() || doc?.title,
      compile: compileLatexViaApi,
      maxPages: 1,
    });
    return { bytes: fitted.pdfBytes, bulletsDropped: fitted.bulletsDropped };
  }

  async function compilePdfPreview() {
    if (!effectiveLatex.trim()) return;
    setPdfError(null);
    setPdfBusy(true);
    try {
      const { bytes } = await buildFittedPdf();
      const blob = new Blob([new Uint8Array(bytes)], {
        type: "application/pdf",
      });
      const url = URL.createObjectURL(blob);
      replacePdfUrl(url);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : "Compile error");
      replacePdfUrl(null);
    } finally {
      setPdfBusy(false);
    }
  }

  async function downloadPdf() {
    if (!effectiveLatex.trim()) return;
    setPdfError(null);
    setPdfBusy(true);
    try {
      const { bytes } = await buildFittedPdf();
      const blob = new Blob([new Uint8Array(bytes)], {
        type: "application/pdf",
      });
      const base = (title.trim() || doc?.title || "resume").replaceAll(
        "/",
        "-",
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${base}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : "Could not build PDF.");
    } finally {
      setPdfBusy(false);
    }
  }

  function toggleId(list: string[], id: string, on: boolean) {
    const set = new Set(list);
    if (on) set.add(id);
    else set.delete(id);
    return [...set];
  }

  function selectAllProfileEntries() {
    setSelExp(profile.experience.map((e) => e.id));
    setSelProj(profile.projects.map((p) => p.id));
  }

  function clearSelection() {
    setSelExp([]);
    setSelProj([]);
  }

  if (!storageReady) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
    );
  }

  if (!doc) {
    return (
      <div className="text-sm text-zinc-600 dark:text-zinc-300">
        Resume not found.
      </div>
    );
  }

  const experienceSorted = sortedExperience(profile);
  const projectsSorted = sortedProjects(profile);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {doc.title}
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Pick profile rows, customize text for this resume only, edit LaTeX,
            or use Optimize for a JD-specific pass.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/optimize/resume?baseId=${encodeURIComponent(doc.id)}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <AiMagicIcon size="sm" />
            Optimize for JD
          </Link>
          <button
            type="button"
            onClick={() =>
              downloadText(
                `${(title.trim() || doc.title).replaceAll("/", "-")}.tex`,
                effectiveLatex,
              )
            }
            className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Download .tex
          </button>
          <button
            type="button"
            disabled={pdfBusy || !effectiveLatex.trim()}
            onClick={() => void downloadPdf()}
            className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-zinc-800"
          >
            {pdfBusy ? "…" : "Download PDF"}
          </button>
        </div>
      </div>

      {pdfError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-100">
          {pdfError}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setView("preview")}
          className={cx(
            "rounded-full px-3 py-1.5 text-sm transition",
            view === "preview"
              ? "bg-accent text-white"
              : "text-muted hover:bg-zinc-100 dark:hover:bg-zinc-800",
          )}
        >
          Preview
        </button>
        <button
          type="button"
          onClick={() => setView("customize")}
          className={cx(
            "rounded-full px-3 py-1.5 text-sm transition",
            view === "customize"
              ? "bg-accent text-white"
              : "text-muted hover:bg-zinc-100 dark:hover:bg-zinc-800",
          )}
        >
          Customize
        </button>
        <button
          type="button"
          onClick={() => setView("latex")}
          className={cx(
            "rounded-full px-3 py-1.5 text-sm transition",
            view === "latex"
              ? "bg-accent text-white"
              : "text-muted hover:bg-zinc-100 dark:hover:bg-zinc-800",
          )}
        >
          LaTeX
        </button>
        <button
          type="button"
          onClick={() => setView("markdown")}
          className={cx(
            "rounded-full px-3 py-1.5 text-sm transition",
            view === "markdown"
              ? "bg-accent text-white"
              : "text-muted hover:bg-zinc-100 dark:hover:bg-zinc-800",
          )}
        >
          (Legacy) Markdown
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <div className="text-sm font-semibold">Document</div>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-zinc-600 dark:text-zinc-300">
              Title
            </span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              persist({
                ...doc,
                title: title.trim() || doc.title,
                overrides: overridesDraft,
                updatedAt: Date.now(),
              });
            }}
            className="self-start rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-dark"
          >
            Save title
          </button>

          <div className="rounded-2xl border border-border p-4 text-sm">
            <div className="font-semibold">Profile entries on this resume</div>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              Turn on “Pick from profile” to show only checked roles and
              projects (e.g. two cybersecurity jobs). Off = use all profile
              entries unless you list specific IDs (legacy).
            </p>
            <label className="mt-3 flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={subsetEnabled}
                onChange={(e) => {
                  const on = e.target.checked;
                  setSubsetEnabled(on);
                  if (on && selExp.length === 0 && selProj.length === 0) {
                    selectAllProfileEntries();
                  }
                }}
                className="rounded border-zinc-300"
              />
              <span>Pick from profile (strict selection)</span>
            </label>

            <div
              className={cx(
                "mt-3 space-y-3",
                !subsetEnabled && "pointer-events-none opacity-50",
              )}
            >
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={selectAllProfileEntries}
                  className="rounded-lg border border-border px-2 py-1 text-xs"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-lg border border-border px-2 py-1 text-xs"
                >
                  Clear all
                </button>
              </div>

              <div>
                <div className="text-xs font-medium text-zinc-500">
                  Experience
                </div>
                <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {experienceSorted.map((exp) => (
                    <li key={exp.id}>
                      <label className="flex cursor-pointer items-start gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selExp.includes(exp.id)}
                          onChange={(e) =>
                            setSelExp((prev) =>
                              toggleId(prev, exp.id, e.target.checked),
                            )
                          }
                          className="mt-0.5 rounded border-zinc-300"
                        />
                        <span>
                          <span className="font-medium">
                            {(exp.title || "").trim() || "(Role)"}
                          </span>
                          <span className="text-zinc-500">
                            {" "}
                            · {(exp.company || "").trim() || "Company"}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                  {profile.experience.length === 0 ? (
                    <li className="text-xs text-zinc-500">No experience in profile.</li>
                  ) : null}
                </ul>
              </div>

              <div>
                <div className="text-xs font-medium text-zinc-500">
                  Projects
                </div>
                <ul className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {projectsSorted.map((proj) => (
                    <li key={proj.id}>
                      <label className="flex cursor-pointer items-start gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selProj.includes(proj.id)}
                          onChange={(e) =>
                            setSelProj((prev) =>
                              toggleId(prev, proj.id, e.target.checked),
                            )
                          }
                          className="mt-0.5 rounded border-zinc-300"
                        />
                        <span>
                          <span className="font-medium">
                            {(proj.name || "").trim() || "(Project)"}
                          </span>
                          {(proj.role || "").trim() ? (
                            <span className="text-zinc-500">
                              {" "}
                              · {(proj.role || "").trim()}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    </li>
                  ))}
                  {profile.projects.length === 0 ? (
                    <li className="text-xs text-zinc-500">No projects in profile.</li>
                  ) : null}
                </ul>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                persist({
                  ...doc,
                  subsetEnabled,
                  defaults: {
                    experienceIds: selExp,
                    projectIds: selProj,
                  },
                  overrides: overridesDraft,
                  updatedAt: Date.now(),
                });
              }}
              className="mt-4 rounded-xl bg-accent px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-dark"
            >
              Save profile selection
            </button>
          </div>

          <div className="rounded-2xl border border-border p-4 text-sm">
            <div className="font-semibold">JD (legacy)</div>
            <div className="mt-2 whitespace-pre-wrap text-xs text-zinc-600 dark:text-zinc-300">
              {doc.jd || "(empty — use Optimize for new flow)"}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          {view === "preview" && previewDoc ? (
            <>
              <div className="text-sm font-semibold">Preview</div>
              <JakeResumePreview profile={displayProfile} doc={previewDoc} />
            </>
          ) : null}

          {view === "customize" && previewDoc ? (
            <>
              <div className="text-sm font-semibold">Customize this resume</div>
              <ResumeCustomizePanel
                profile={profile}
                mergedProfile={displayProfile}
                overrides={overridesDraft}
                setOverrides={setOverridesDraft}
                includedExperience={resumeFilteredExperience(
                  profile,
                  subsetEnabled,
                  selExp,
                )}
                includedProjects={resumeFilteredProjects(
                  profile,
                  subsetEnabled,
                  selProj,
                )}
                onSave={() => {
                  persist({
                    ...doc,
                    overrides: overridesDraft,
                    updatedAt: Date.now(),
                  });
                }}
              />
            </>
          ) : null}

          {view === "latex" ? (
            <div className="flex flex-col gap-3">
              <div className="text-sm font-semibold">LaTeX</div>
              <div className="flex flex-wrap gap-2 rounded-xl border border-border p-2">
                <button
                  type="button"
                  onClick={() => setLatexMode("generated")}
                  className={cx(
                    "rounded-lg px-3 py-1.5 text-xs font-medium",
                    latexMode === "generated"
                      ? "bg-accent text-white"
                      : "text-zinc-600 dark:text-zinc-400",
                  )}
                >
                  Generated (Jake + profile)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLatexMode("custom");
                    if (!customLatexDraft.trim()) {
                      setCustomLatexDraft(generatedLatex);
                    }
                  }}
                  className={cx(
                    "rounded-lg px-3 py-1.5 text-xs font-medium",
                    latexMode === "custom"
                      ? "bg-accent text-white"
                      : "text-zinc-600 dark:text-zinc-400",
                  )}
                >
                  Custom (full document)
                </button>
              </div>

              {latexMode === "generated" ? (
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Read-only output from your profile and the selection on the
                  left. Switch to Custom to edit the full .tex yourself
                  (Tectonic / node-latex-compiler).
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCustomLatexDraft(generatedLatex)}
                    className="rounded-lg border border-border px-2 py-1 text-xs"
                  >
                    Replace from generated
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      persist({
                        ...doc,
                        latexMode: "custom",
                        customLatex: customLatexDraft,
                        overrides: overridesDraft,
                        updatedAt: Date.now(),
                      });
                    }}
                    className="rounded-lg bg-accent px-2 py-1 text-xs font-medium text-white"
                  >
                    Save custom LaTeX
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      persist({
                        ...doc,
                        latexMode: "generated",
                        overrides: overridesDraft,
                        updatedAt: Date.now(),
                      });
                      setLatexMode("generated");
                    }}
                    className="rounded-lg border border-border px-2 py-1 text-xs"
                  >
                    Use generated again
                  </button>
                </div>
              )}

              <textarea
                value={latexMode === "custom" ? customLatexDraft : generatedLatex}
                onChange={(e) => {
                  if (latexMode === "custom") {
                    setCustomLatexDraft(e.target.value);
                  }
                }}
                readOnly={latexMode === "generated"}
                spellCheck={false}
                rows={22}
                className="min-h-[280px] w-full rounded-2xl border border-border bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-accent"
              />

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={pdfBusy || !effectiveLatex.trim()}
                  onClick={() => void compilePdfPreview()}
                  className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-zinc-800"
                >
                  {pdfBusy ? "Compiling…" : "Compile preview (PDF)"}
                </button>
              </div>

              {pdfObjectUrl ? (
                <div className="flex flex-col gap-2">
                  <div className="text-xs font-medium text-zinc-500">
                    PDF preview (local)
                  </div>
                  <iframe
                    title="LaTeX PDF preview"
                    src={pdfObjectUrl}
                    className="h-[520px] w-full rounded-xl border border-border"
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {view === "markdown" ? (
            <>
              <div className="text-sm font-semibold">(Legacy) Markdown</div>
              <textarea
                value={doc.outputMarkdown ?? ""}
                readOnly
                rows={26}
                className="rounded-2xl border border-border bg-surface px-3 py-2 font-mono text-xs outline-none focus:border-accent"
              />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
