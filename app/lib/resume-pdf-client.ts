import type { Profile } from "./profile-model";

/** Submit data to the fixed, escaped server template; raw TeX uses a separate sandbox route. */
export async function compileGeneratedResume(input: {
  profile: Profile;
  experienceIds?: string[];
  projectIds?: string[];
  subsetEnabled?: boolean;
  title?: string;
  experienceBulletsById?: Record<string, string[]>;
  projectBulletsById?: Record<string, string[]>;
}) {
  const response = await fetch("/api/extension/resume-pdf", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, selectedExperienceIds: input.experienceIds ?? [], selectedProjectIds: input.projectIds ?? [] }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `PDF compilation failed (${response.status}).`);
  }
  return { pdfBytes: new Uint8Array(await response.arrayBuffer()), bulletsDropped: Number(response.headers.get("X-Resume-Bullets-Trimmed") ?? 0) };
}
