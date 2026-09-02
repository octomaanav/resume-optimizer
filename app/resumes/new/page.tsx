"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createResumeDraft } from "../../lib/document-schemas";
import { useHydratedProfile, useHydratedResumes } from "../../lib/use-hydrated-storage";
import { sortedExperience, sortedProjects } from "../../lib/sort-profile";

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export default function NewResumePage() {
  const router = useRouter();
  const [profile] = useHydratedProfile();
  const [docs, , ready, persistResumes] = useHydratedResumes();
  const [title, setTitle] = useState("manav_swe_resume");
  const [error, setError] = useState<string | null>(null);
  const [pickNow, setPickNow] = useState(false);
  const [selExp, setSelExp] = useState<string[]>([]);
  const [selProj, setSelProj] = useState<string[]>([]);

  const experienceSorted = useMemo(
    () => sortedExperience(profile),
    [profile],
  );
  const projectsSorted = useMemo(() => sortedProjects(profile), [profile]);

  function toggleId(list: string[], id: string, on: boolean) {
    const set = new Set(list);
    if (on) set.add(id);
    else set.delete(id);
    return [...set];
  }

  async function onCreate() {
    setError(null);
    const name = title.trim();
    if (!name) {
      setError("Give this resume a name (e.g. cyber_security_resume).");
      return;
    }

    if (pickNow && selExp.length === 0 && selProj.length === 0) {
      setError(
        "Select at least one experience or project, or turn off “Pick now”.",
      );
      return;
    }

    const draft = createResumeDraft(name, {
      subsetEnabled: pickNow,
      experienceIds: pickNow ? selExp : [],
      projectIds: pickNow ? selProj : [],
    });
    const next = [draft, ...docs];
    await persistResumes(next);
    router.push(`/resumes/${draft.id}`);
  }

  if (!ready) {
    return (
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New resume</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Create a saved resume for{" "}
          <span className="font-medium">Documents</span>. You can limit which
          profile roles and projects appear (e.g. a cybersecurity-only resume),
          then refine on the next screen or edit raw LaTeX there.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-100">
          {error}
        </div>
      ) : null}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Resume name</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="e.g. cyber_security_resume"
        />
      </label>

      <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={pickNow}
            onChange={(e) => {
              const on = e.target.checked;
              setPickNow(on);
              if (on && selExp.length === 0 && selProj.length === 0) {
                setSelExp(profile.experience.map((e) => e.id));
                setSelProj(profile.projects.map((p) => p.id));
              }
            }}
            className="mt-1 rounded border-zinc-300"
          />
          <div>
            <div className="text-sm font-medium">
              Pick experiences &amp; projects now
            </div>
            <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
              When enabled, only checked entries from your profile are included.
              You can change this anytime on the resume page. When disabled, the
              resume starts in legacy mode (all profile entries).
            </p>
          </div>
        </label>

        <div
          className={cx(
            "mt-4 space-y-4",
            !pickNow && "pointer-events-none opacity-50",
          )}
        >
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setSelExp(profile.experience.map((e) => e.id));
                setSelProj(profile.projects.map((p) => p.id));
              }}
              className="rounded-lg border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => {
                setSelExp([]);
                setSelProj([]);
              }}
              className="rounded-lg border border-zinc-200 px-2 py-1 text-xs dark:border-zinc-700"
            >
              Clear
            </button>
          </div>

          <div>
            <div className="text-xs font-semibold text-zinc-500">Experience</div>
            <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-zinc-100 p-2 dark:border-zinc-800">
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
                      {(exp.title || "").trim() || "(Role)"} ·{" "}
                      {(exp.company || "").trim() || "Company"}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-xs font-semibold text-zinc-500">Projects</div>
            <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-zinc-100 p-2 dark:border-zinc-800">
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
                      {(proj.name || "").trim() || "(Project)"}
                      {(proj.role || "").trim()
                        ? ` · ${(proj.role || "").trim()}`
                        : ""}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => void onCreate()}
          className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-60 hover:bg-accent-dark"
        >
          Create resume
        </button>
      </div>
    </div>
  );
}
