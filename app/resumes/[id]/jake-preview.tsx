"use client";

import type { Profile } from "../../lib/profile-model";
import type { ResumeDoc } from "../../lib/document-schemas";
import { profileSkillDisplayRows } from "../../lib/profile-skills";
import {
  resumeFilteredExperience,
  resumeFilteredProjects,
} from "../../lib/resume-filter";
import { experienceSortKey, projectSortKey } from "../../lib/sort-profile";

// Matches **markdown bold**, currency ($2M, $500K), percentages, multipliers (3x),
// numbers with K/M/B suffixes, time values (50ms, 2s), and numbers before impact nouns.
const METRIC_RE =
  /\*\*(.+?)\*\*|\$[\d,.]+[KMBkm]?\b|\b\d+(?:[,.]\d+)*(?:\+?%|[xX]\b|\+(?!\d)|\+?[KMBkm]\b|\s*ms\b|\s*s\b|\s*min\b|\s*hrs?\b|\s*hours?\b|\s*days?\b|\s*weeks?\b|\s*months?\b|\s*years?\b|\s+(?:users?|customers?|clients?|engineers?|developers?|teams?|services?|microservices?|features?|requests?|repos?|endpoints?|deployments?|countries?|markets?|applications?)\b)|(?:\d{1,3})(?:,\d{3})+(?:\.\d+)?\b/g;

function renderBullet(text: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  const re = new RegExp(METRIC_RE.source, METRIC_RE.flags);
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    // match[1] = inner text of **bold**, otherwise use full match
    const display = match[1] ?? match[0];
    nodes.push(
      <strong
        key={match.index}
        className="font-semibold text-zinc-950 dark:text-zinc-50"
      >
        {display}
      </strong>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return <>{nodes}</>;
}

export function JakeResumePreview({
  profile,
  doc,
  experienceBulletsById,
  projectBulletsById,
  highlightMetrics,
}: {
  profile: Profile;
  doc: ResumeDoc;
  experienceBulletsById?: Record<string, string[]>;
  projectBulletsById?: Record<string, string[]>;
  highlightMetrics?: boolean;
}) {
  const expIds = doc.selected?.experienceIds ?? doc.defaults?.experienceIds ?? [];
  const projIds = doc.selected?.projectIds ?? doc.defaults?.projectIds ?? [];
  const subset = doc.subsetEnabled ?? false;
  let exp = resumeFilteredExperience(profile, subset, expIds);
  let proj = resumeFilteredProjects(profile, subset, projIds);
  exp = [...exp].sort((a, b) => experienceSortKey(b) - experienceSortKey(a));
  proj = [...proj].sort((a, b) => projectSortKey(b) - projectSortKey(a));
  const edu = profile.education;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="text-center">
        <div className="text-xl font-semibold tracking-tight">
          {profile.name || "Your Name"}
        </div>
        <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
          {[profile.phone, profile.email, profile.location]
            .map((x) => x?.trim())
            .filter(Boolean)
            .join(" | ")}
        </div>
        {profile.links.length ? (
          <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
            {profile.links
              .slice(0, 3)
              .map((l) => l.label || l.url)
              .filter(Boolean)
              .join(" | ")}
          </div>
        ) : null}
      </div>

      {edu.length ? (
        <section className="mt-6">
          <div className="border-b border-zinc-200 pb-1 text-sm font-semibold uppercase tracking-wide dark:border-zinc-800">
            Education
          </div>
          <div className="mt-3 space-y-3">
            {edu.map((e) => (
              <div key={e.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-sm font-semibold">
                    {e.school}
                    {e.location ? (
                      <span className="font-normal text-zinc-600 dark:text-zinc-300">
                        {" "}
                        — {e.location}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-300">
                    {[e.start, e.end].filter(Boolean).join(" - ")}
                  </div>
                </div>
                {e.degree ? (
                  <div className="text-xs italic text-zinc-600 dark:text-zinc-300">
                    {e.degree}
                  </div>
                ) : null}
                {e.details?.length ? (
                  <ul className="mt-1 list-disc pl-5 text-xs text-zinc-700 dark:text-zinc-200">
                    {e.details.map((d, idx) => (
                      <li key={idx}>{d}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {exp.length ? (
        <section className="mt-6">
          <div className="border-b border-zinc-200 pb-1 text-sm font-semibold uppercase tracking-wide dark:border-zinc-800">
            Experience
          </div>
          <div className="mt-3 space-y-4">
            {exp.map((e) => (
              <div key={e.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-sm font-semibold">
                    {e.company}
                    {e.location ? (
                      <span className="font-normal text-zinc-600 dark:text-zinc-300">
                        {" "}
                        — {e.location}
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-300">
                    {[e.start, e.end].filter(Boolean).join(" - ")}
                  </div>
                </div>
                <div className="text-xs italic text-zinc-600 dark:text-zinc-300">
                  {e.title}
                </div>
                {(experienceBulletsById?.[e.id] ?? e.bullets).length ? (
                  <ul className="mt-1 list-disc pl-5 text-xs text-zinc-700 dark:text-zinc-200">
                    {(experienceBulletsById?.[e.id] ?? e.bullets).map((b, idx) => (
                      <li key={idx}>{highlightMetrics ? renderBullet(b) : b}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {proj.length ? (
        <section className="mt-6">
          <div className="border-b border-zinc-200 pb-1 text-sm font-semibold uppercase tracking-wide dark:border-zinc-800">
            Projects
          </div>
          <div className="mt-3 space-y-4">
            {proj.map((p) => (
              <div key={p.id}>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-sm">
                    <span className="font-semibold">{p.name}</span>
                    {p.tech.length > 0 ? (
                      <span className="text-zinc-600 dark:text-zinc-300">
                        {" "}| <span className="italic">{p.tech.slice(0, 10).join(", ")}</span>
                      </span>
                    ) : null}
                    {p.link?.trim() ? (
                      <span className="text-zinc-600 dark:text-zinc-300">
                        {" "}|{" "}
                        <a
                          href={p.link.trim()}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-accent"
                        >
                          Link
                        </a>
                      </span>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-xs text-zinc-600 dark:text-zinc-300">
                    {[p.start, p.end].filter(Boolean).join(" - ")}
                  </div>
                </div>
                {(projectBulletsById?.[p.id] ?? p.bullets).length ? (
                  <ul className="mt-1 list-disc pl-5 text-xs text-zinc-700 dark:text-zinc-200">
                    {(projectBulletsById?.[p.id] ?? p.bullets).map((b, idx) => (
                      <li key={idx}>{highlightMetrics ? renderBullet(b) : b}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {profileSkillDisplayRows(profile).length > 0 ? (
        <section className="mt-6">
          <div className="border-b border-zinc-200 pb-1 text-sm font-semibold uppercase tracking-wide dark:border-zinc-800">
            Skills
          </div>
          <div className="mt-3 space-y-2 text-xs text-zinc-700 dark:text-zinc-200">
            {profileSkillDisplayRows(profile).map((row, idx) => (
              <div key={`${row.label}-${idx}`}>
                <span className="font-semibold">{row.label}:</span>{" "}
                {row.line}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

