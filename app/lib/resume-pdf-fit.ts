import { PDFDocument } from "pdf-lib";

import type { Profile } from "./profile-model";
import { renderJakeResumeTex } from "./jake-latex";
import {
  resumeFilteredExperience,
  resumeFilteredProjects,
} from "./resume-filter";
import { experienceSortKey, projectSortKey } from "./sort-profile";

export async function countPdfPages(bytes: Uint8Array | Buffer): Promise<number> {
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc.getPageCount();
}

export interface FitResumeParams {
  profile: Profile;
  experienceIds?: string[];
  projectIds?: string[];
  subsetEnabled?: boolean;
  title?: string;
  experienceBulletsById?: Record<string, string[]>;
  projectBulletsById?: Record<string, string[]>;
  highlightMetrics?: boolean;
  /** Compiles LaTeX source to a PDF's raw bytes. Throws (or rejects) on failure. */
  compile: (tex: string) => Promise<Uint8Array>;
  /** Resumes stop shrinking once they're at or under this page count. Default 1. */
  maxPages?: number;
  /** Safety cap on compile round-trips. Default 12. */
  maxIterations?: number;
}

export interface FitResumeResult {
  latex: string;
  pdfBytes: Uint8Array;
  pages: number;
  /** How many bullets were dropped to make the resume fit. */
  bulletsDropped: number;
  /** True if maxPages was reached; false if we ran out of content/iterations first. */
  fits: boolean;
}

/**
 * Renders + compiles a resume, and if it overflows the page limit, repeatedly
 * drops the least-important trailing bullet (from whichever visible
 * experience/project entry currently has the most bullets, preferring the
 * lower-priority entry on ties) and recompiles until it fits or we run out
 * of content to cut.
 *
 * Per-bullet line-wrap tightening (dropping short orphan trailing lines) is
 * always applied inside `renderJakeResumeTex` itself, so this loop only
 * kicks in for genuine overflow — too much content, not wasted wrap space.
 */
export async function fitResumeToPageLimit(
  params: FitResumeParams,
): Promise<FitResumeResult> {
  const {
    profile,
    experienceIds = [],
    projectIds = [],
    subsetEnabled = false,
    title,
    experienceBulletsById = {},
    projectBulletsById = {},
    highlightMetrics = false,
    compile,
    maxPages = 1,
    maxIterations = 12,
  } = params;

  const exp = [...resumeFilteredExperience(profile, subsetEnabled, experienceIds)].sort(
    (a, b) => experienceSortKey(b) - experienceSortKey(a),
  );
  const proj = [...resumeFilteredProjects(profile, subsetEnabled, projectIds)].sort(
    (a, b) => projectSortKey(b) - projectSortKey(a),
  );

  // Working copies we can pop bullets off of without touching caller state.
  const workingExp: Record<string, string[]> = {};
  for (const e of exp) {
    workingExp[e.id] = [...(experienceBulletsById[e.id] ?? e.bullets)];
  }
  const workingProj: Record<string, string[]> = {};
  for (const p of proj) {
    workingProj[p.id] = [...(projectBulletsById[p.id] ?? p.bullets)];
  }

  // Lower priority = later in the recency-sorted list = trimmed first on ties.
  const priority: Array<{ kind: "exp" | "proj"; id: string; rank: number }> = [
    ...exp.map((e, i) => ({ kind: "exp" as const, id: e.id, rank: i })),
    ...proj.map((p, i) => ({ kind: "proj" as const, id: p.id, rank: i })),
  ];

  function dropOneBullet(): boolean {
    let target: (typeof priority)[number] | null = null;
    let targetCount = 0;
    for (const cand of priority) {
      const bucket = cand.kind === "exp" ? workingExp : workingProj;
      const count = bucket[cand.id]?.length ?? 0;
      if (count === 0) continue;
      if (
        count > targetCount ||
        (count === targetCount && target && cand.rank > target.rank)
      ) {
        target = cand;
        targetCount = count;
      }
    }
    if (!target) return false;
    const bucket = target.kind === "exp" ? workingExp : workingProj;
    bucket[target.id]!.pop();
    return true;
  }

  let bulletsDropped = 0;
  let lastLatex = "";
  let lastBytes: Uint8Array = new Uint8Array();
  let lastPages = Number.POSITIVE_INFINITY;

  for (let attempt = 0; attempt < maxIterations; attempt++) {
    const latex = renderJakeResumeTex({
      profile,
      experienceIds,
      projectIds,
      subsetEnabled,
      title,
      experienceBulletsById: workingExp,
      projectBulletsById: workingProj,
      highlightMetrics,
    });

    const pdfBytes = await compile(latex);
    const pages = await countPdfPages(pdfBytes);

    lastLatex = latex;
    lastBytes = pdfBytes;
    lastPages = pages;

    if (pages <= maxPages) {
      return { latex, pdfBytes, pages, bulletsDropped, fits: true };
    }

    if (!dropOneBullet()) {
      // Nothing left to trim — return the best (smallest) attempt we have.
      break;
    }
    bulletsDropped++;
  }

  return {
    latex: lastLatex,
    pdfBytes: lastBytes,
    pages: lastPages,
    bulletsDropped,
    fits: lastPages <= maxPages,
  };
}
