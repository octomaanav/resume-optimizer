/**
 * store.ts — short-lived server-side store for optimization results and PDFs.
 *
 * Why this exists: without it, `optimize_resume` would have to return the full
 * bullet payload into the model's context and the model would have to hand it
 * back verbatim to `build_resume_pdf`. That is slow, expensive, and lossy.
 * Instead tools exchange short ids and the bytes never enter the transcript.
 *
 * In-memory and per-process: fine for a single dev server or one container.
 * Swap for Redis/Supabase if this is ever deployed behind more than one instance.
 */

type Entry<T> = { value: T; expiresAt: number };

const TTL_MS = 60 * 60 * 1000; // 1 hour

function makeStore<T>() {
  const map = new Map<string, Entry<T>>();

  function sweep() {
    const now = Date.now();
    for (const [k, v] of map) if (v.expiresAt <= now) map.delete(k);
  }

  return {
    put(value: T, prefix: string): string {
      sweep();
      const id = `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
      map.set(id, { value, expiresAt: Date.now() + TTL_MS });
      return id;
    },
    get(id: string): T | null {
      sweep();
      return map.get(id)?.value ?? null;
    },
    list(): string[] {
      sweep();
      return [...map.keys()];
    },
  };
}

export type StoredResumeOptimization = {
  jd: string;
  selectedExperienceIds: string[];
  selectedProjectIds: string[];
  experienceBulletsById: Record<string, string[]>;
  projectBulletsById: Record<string, string[]>;
  bulletChanges?: unknown;
  createdAt: number;
  /** Set by review_resume_draft once Gate 1 is approved (Track A8). */
  approved?: boolean;
};

export type StoredPdf = {
  bytes: Uint8Array;
  filename: string;
  createdAt: number;
};

export const resumeOptimizations = makeStore<StoredResumeOptimization>();
export const pdfArtifacts = makeStore<StoredPdf>();
