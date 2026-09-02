"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Profile } from "../../lib/profile-model";
import {
  profileSkillsFlat,
  usesSkillCategories,
} from "../../lib/profile-skills";
import type {
  ResumeEducationEntryOverride,
  ResumeExperienceEntryOverride,
  ResumeOverrides,
  ResumeProjectEntryOverride,
} from "../../lib/document-schemas";

function chipSplit(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function bulletsEqual(a: string[], b: string[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </span>
      {children}
    </label>
  );
}

type Props = {
  profile: Profile;
  mergedProfile: Profile;
  overrides: ResumeOverrides;
  setOverrides: Dispatch<SetStateAction<ResumeOverrides>>;
  includedExperience: Profile["experience"];
  includedProjects: Profile["projects"];
  onSave: () => void;
};

export function ResumeCustomizePanel({
  profile,
  mergedProfile,
  overrides,
  setOverrides,
  includedExperience,
  includedProjects,
  onSave,
}: Props) {
  function clearExp(id: string) {
    setOverrides((o) => {
      const next = { ...o.experience };
      delete next[id];
      return { ...o, experience: next };
    });
  }

  function patchExp(id: string, base: Profile["experience"][number], patch: Partial<ResumeExperienceEntryOverride>) {
    setOverrides((o) => {
      const cur = { ...(o.experience[id] ?? {}) };
      for (const [k, val] of Object.entries(patch) as [
        keyof ResumeExperienceEntryOverride,
        string | string[] | undefined,
      ][]) {
        if (val === undefined) continue;
        const bk = base[k as keyof typeof base];
        if (k === "bullets" && Array.isArray(val) && Array.isArray(bk)) {
          if (bulletsEqual(val, bk as string[])) delete cur[k];
          else (cur as Record<string, unknown>)[k] = val;
        } else if (val === bk) {
          delete cur[k];
        } else {
          (cur as Record<string, unknown>)[k] = val;
        }
      }
      const nextEx = { ...o.experience };
      if (Object.keys(cur).length === 0) delete nextEx[id];
      else nextEx[id] = cur;
      return { ...o, experience: nextEx };
    });
  }

  function clearProj(id: string) {
    setOverrides((o) => {
      const next = { ...o.projects };
      delete next[id];
      return { ...o, projects: next };
    });
  }

  function patchProj(id: string, base: Profile["projects"][number], patch: Partial<ResumeProjectEntryOverride>) {
    setOverrides((o) => {
      const cur = { ...(o.projects[id] ?? {}) };
      for (const [k, val] of Object.entries(patch) as [
        keyof ResumeProjectEntryOverride,
        string | string[] | undefined,
      ][]) {
        if (val === undefined) continue;
        const bk = base[k as keyof typeof base];
        if (k === "bullets" && Array.isArray(val) && Array.isArray(bk)) {
          if (bulletsEqual(val, bk as string[])) delete cur[k];
          else (cur as Record<string, unknown>)[k] = val;
        } else if (k === "tech" && Array.isArray(val) && Array.isArray(bk)) {
          if (bulletsEqual(val, bk as string[])) delete cur[k];
          else (cur as Record<string, unknown>)[k] = val;
        } else if (val === bk) {
          delete cur[k];
        } else {
          (cur as Record<string, unknown>)[k] = val;
        }
      }
      const nextP = { ...o.projects };
      if (Object.keys(cur).length === 0) delete nextP[id];
      else nextP[id] = cur;
      return { ...o, projects: nextP };
    });
  }

  function clearEdu(id: string) {
    setOverrides((o) => {
      const next = { ...o.education };
      delete next[id];
      return { ...o, education: next };
    });
  }

  function patchEdu(
    id: string,
    base: Profile["education"][number],
    patch: Partial<ResumeEducationEntryOverride>,
  ) {
    setOverrides((o) => {
      const cur = { ...(o.education[id] ?? {}) };
      for (const [k, val] of Object.entries(patch) as [
        keyof ResumeEducationEntryOverride,
        string | string[] | undefined,
      ][]) {
        if (val === undefined) continue;
        const bk = base[k as keyof typeof base];
        if (k === "details" && Array.isArray(val) && Array.isArray(bk)) {
          if (bulletsEqual(val, bk as string[])) delete cur[k];
          else (cur as Record<string, unknown>)[k] = val;
        } else if (val === bk) {
          delete cur[k];
        } else {
          (cur as Record<string, unknown>)[k] = val;
        }
      }
      const nextE = { ...o.education };
      if (Object.keys(cur).length === 0) delete nextE[id];
      else nextE[id] = cur;
      return { ...o, education: nextE };
    });
  }

  function patchHeader(
    patch: Partial<{
      name: string;
      email: string;
      phone: string;
      location: string;
      summary: string;
      skills: string[];
    }>,
  ) {
    setOverrides((o) => {
      const ph = { ...o.profileHeader };
      for (const [k, val] of Object.entries(patch) as [
        keyof typeof ph,
        string | string[] | undefined,
      ][]) {
        if (val === undefined) continue;
        const bk = profile[k as keyof Profile];
        if (k === "skills" && Array.isArray(val) && Array.isArray(bk)) {
          if (bulletsEqual(val, bk as string[])) delete ph[k];
          else (ph as Record<string, unknown>)[k] = val;
        } else if (val === bk) {
          delete ph[k];
        } else {
          (ph as Record<string, unknown>)[k] = val;
        }
      }
      return {
        ...o,
        profileHeader: Object.keys(ph).length ? ph : undefined,
      };
    });
  }

  const hasOverrides =
    (overrides.profileHeader &&
      Object.keys(overrides.profileHeader).length > 0) ||
    Object.keys(overrides.experience).length > 0 ||
    Object.keys(overrides.projects).length > 0 ||
    Object.keys(overrides.education).length > 0;

  return (
    <div className="flex flex-col gap-6 text-sm">
      <div>
        <p className="text-xs text-zinc-600 dark:text-zinc-400">
          Edits here are stored on <span className="font-medium">this resume</span>{" "}
          only. Your global Profile is unchanged—useful for a cybersecurity-only
          wording without touching other resumes.
        </p>
        {hasOverrides ? (
          <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
            This resume has custom text. Save below to persist it.
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-border p-4">
        <div className="font-semibold">Header &amp; summary</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <input
              value={mergedProfile.name}
              onChange={(e) => patchHeader({ name: e.target.value })}
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs"
            />
          </Field>
          <Field label="Email">
            <input
              value={mergedProfile.email ?? ""}
              onChange={(e) => patchHeader({ email: e.target.value })}
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs"
            />
          </Field>
          <Field label="Phone">
            <input
              value={mergedProfile.phone ?? ""}
              onChange={(e) => patchHeader({ phone: e.target.value })}
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs"
            />
          </Field>
          <Field label="Location">
            <input
              value={mergedProfile.location ?? ""}
              onChange={(e) => patchHeader({ location: e.target.value })}
              className="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs"
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Summary">
            <textarea
              value={mergedProfile.summary ?? ""}
              onChange={(e) => patchHeader({ summary: e.target.value })}
              rows={3}
              className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs"
            />
          </Field>
        </div>
        {usesSkillCategories(mergedProfile) ? (
          <p className="mt-3 text-xs text-zinc-500">
            Skill labels and groups are edited on the Profile page (Skills
            section).
          </p>
        ) : (
          <div className="mt-3">
            <Field label="Skills (comma-separated, this resume only)">
              <input
                value={profileSkillsFlat(mergedProfile).join(", ")}
                onChange={(e) =>
                  patchHeader({ skills: chipSplit(e.target.value) })
                }
                className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs"
              />
            </Field>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border p-4">
        <div className="font-semibold">Experience on this resume</div>
        {includedExperience.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">
            None selected—adjust checkboxes under “Profile entries”.
          </p>
        ) : (
          <div className="mt-3 space-y-6">
            {includedExperience.map((exp) => {
              const base = profile.experience.find((e) => e.id === exp.id) ?? exp;
              const m = mergedProfile.experience.find((e) => e.id === exp.id) ?? exp;
              return (
                <div
                  key={exp.id}
                  className="rounded-xl border border-border p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-500">
                      Role card
                    </span>
                    {overrides.experience[exp.id] ? (
                      <button
                        type="button"
                        onClick={() => clearExp(exp.id)}
                        className="text-xs text-zinc-500 underline"
                      >
                        Reset to profile
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Field label="Title">
                      <input
                        value={m.title}
                        onChange={(e) =>
                          patchExp(exp.id, base, { title: e.target.value })
                        }
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      />
                    </Field>
                    <Field label="Company">
                      <input
                        value={m.company}
                        onChange={(e) =>
                          patchExp(exp.id, base, { company: e.target.value })
                        }
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      />
                    </Field>
                    <Field label="Location">
                      <input
                        value={m.location ?? ""}
                        onChange={(e) =>
                          patchExp(exp.id, base, { location: e.target.value })
                        }
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      />
                    </Field>
                    <Field label="Type">
                      <input
                        value={m.type ?? ""}
                        onChange={(e) =>
                          patchExp(exp.id, base, { type: e.target.value })
                        }
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      />
                    </Field>
                    <Field label="Start">
                      <input
                        value={m.start ?? ""}
                        onChange={(e) =>
                          patchExp(exp.id, base, { start: e.target.value })
                        }
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      />
                    </Field>
                    <Field label="End">
                      <input
                        value={m.end ?? ""}
                        onChange={(e) =>
                          patchExp(exp.id, base, { end: e.target.value })
                        }
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      />
                    </Field>
                  </div>
                  <div className="mt-2">
                    <Field label="Bullets (one per line)">
                      <textarea
                        value={m.bullets.join("\n")}
                        onChange={(e) =>
                          patchExp(exp.id, base, {
                            bullets: e.target.value
                              .split("\n")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        rows={5}
                        className="w-full rounded-lg border border-border bg-surface px-2 py-1 font-mono text-[11px]"
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border p-4">
        <div className="font-semibold">Projects on this resume</div>
        {includedProjects.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">
            None selected—adjust checkboxes under “Profile entries”.
          </p>
        ) : (
          <div className="mt-3 space-y-6">
            {includedProjects.map((proj) => {
              const base = profile.projects.find((p) => p.id === proj.id) ?? proj;
              const m = mergedProfile.projects.find((p) => p.id === proj.id) ?? proj;
              return (
                <div
                  key={proj.id}
                  className="rounded-xl border border-border p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-500">
                      Project card
                    </span>
                    {overrides.projects[proj.id] ? (
                      <button
                        type="button"
                        onClick={() => clearProj(proj.id)}
                        className="text-xs text-zinc-500 underline"
                      >
                        Reset to profile
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Field label="Name">
                      <input
                        value={m.name}
                        onChange={(e) =>
                          patchProj(proj.id, base, { name: e.target.value })
                        }
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      />
                    </Field>
                    <Field label="Role">
                      <input
                        value={m.role ?? ""}
                        onChange={(e) =>
                          patchProj(proj.id, base, { role: e.target.value })
                        }
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      />
                    </Field>
                    <Field label="Link">
                      <input
                        value={m.link ?? ""}
                        onChange={(e) =>
                          patchProj(proj.id, base, { link: e.target.value })
                        }
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      />
                    </Field>
                    <Field label="Location">
                      <input
                        value={m.location ?? ""}
                        onChange={(e) =>
                          patchProj(proj.id, base, { location: e.target.value })
                        }
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      />
                    </Field>
                    <Field label="Start">
                      <input
                        value={m.start ?? ""}
                        onChange={(e) =>
                          patchProj(proj.id, base, { start: e.target.value })
                        }
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      />
                    </Field>
                    <Field label="End">
                      <input
                        value={m.end ?? ""}
                        onChange={(e) =>
                          patchProj(proj.id, base, { end: e.target.value })
                        }
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      />
                    </Field>
                  </div>
                  <div className="mt-2">
                    <Field label="Tech (comma-separated)">
                      <input
                        value={m.tech.join(", ")}
                        onChange={(e) =>
                          patchProj(proj.id, base, {
                            tech: chipSplit(e.target.value),
                          })
                        }
                        className="w-full rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      />
                    </Field>
                  </div>
                  <div className="mt-2">
                    <Field label="Bullets (one per line)">
                      <textarea
                        value={m.bullets.join("\n")}
                        onChange={(e) =>
                          patchProj(proj.id, base, {
                            bullets: e.target.value
                              .split("\n")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        rows={5}
                        className="w-full rounded-lg border border-border bg-surface px-2 py-1 font-mono text-[11px]"
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border p-4">
        <div className="font-semibold">Education (always on Jake template)</div>
        {profile.education.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">No education in profile.</p>
        ) : (
          <div className="mt-3 space-y-6">
            {profile.education.map((ed) => {
              const m =
                mergedProfile.education.find((e) => e.id === ed.id) ?? ed;
              return (
                <div
                  key={ed.id}
                  className="rounded-xl border border-border p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-zinc-500">
                      {ed.school || "School"}
                    </span>
                    {overrides.education[ed.id] ? (
                      <button
                        type="button"
                        onClick={() => clearEdu(ed.id)}
                        className="text-xs text-zinc-500 underline"
                      >
                        Reset to profile
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Field label="School">
                      <input
                        value={m.school}
                        onChange={(e) =>
                          patchEdu(ed.id, ed, { school: e.target.value })
                        }
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      />
                    </Field>
                    <Field label="Degree">
                      <input
                        value={m.degree ?? ""}
                        onChange={(e) =>
                          patchEdu(ed.id, ed, { degree: e.target.value })
                        }
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      />
                    </Field>
                    <Field label="Location">
                      <input
                        value={m.location ?? ""}
                        onChange={(e) =>
                          patchEdu(ed.id, ed, { location: e.target.value })
                        }
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      />
                    </Field>
                    <Field label="Start">
                      <input
                        value={m.start ?? ""}
                        onChange={(e) =>
                          patchEdu(ed.id, ed, { start: e.target.value })
                        }
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      />
                    </Field>
                    <Field label="End">
                      <input
                        value={m.end ?? ""}
                        onChange={(e) =>
                          patchEdu(ed.id, ed, { end: e.target.value })
                        }
                        className="rounded-lg border border-border bg-surface px-2 py-1 text-xs"
                      />
                    </Field>
                  </div>
                  <div className="mt-2">
                    <Field label="Details (one per line)">
                      <textarea
                        value={(m.details ?? []).join("\n")}
                        onChange={(e) =>
                          patchEdu(ed.id, ed, {
                            details: e.target.value
                              .split("\n")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        rows={4}
                        className="w-full rounded-lg border border-border bg-surface px-2 py-1 font-mono text-[11px]"
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onSave}
        className={cx(
          "self-start rounded-xl px-4 py-2 text-sm font-medium text-white",
          "bg-accent hover:bg-accent-dark",
        )}
      >
        Save resume customizations
      </button>
    </div>
  );
}
