import type { Profile } from "./profile-model";
import { profileSkillDisplayRows } from "./profile-skills";
import { sortedExperience, sortedProjects } from "./sort-profile";

/** Selection is an AI decision; the preview's facts come from the profile. */
export function renderSelectedResumeMarkdown(
  profile: Profile,
  experienceIds: string[],
  projectIds: string[],
): string {
  const lines = [`# ${profile.name}`];
  const contact = [profile.email, profile.phone, profile.location,
    ...profile.links.map(link => link.url)].filter(Boolean);
  if (contact.length) lines.push("", contact.join(" | "));
  if (profile.summary) lines.push("", profile.summary);
  const experience = sortedExperience(profile).filter(e => experienceIds.includes(e.id));
  if (experience.length) {
    lines.push("", "## Experience");
    for (const entry of experience) {
      lines.push("", `### ${[entry.title, entry.company].filter(Boolean).join(" — ")}`);
      const details = [entry.location, [entry.start, entry.end].filter(Boolean).join(" — ")].filter(Boolean);
      if (details.length) lines.push(details.join(" | "));
      lines.push(...entry.bullets.map(bullet => `- ${bullet}`));
    }
  }
  const projects = sortedProjects(profile).filter(p => projectIds.includes(p.id));
  if (projects.length) {
    lines.push("", "## Projects");
    for (const entry of projects) {
      lines.push("", `### ${entry.name}`);
      if (entry.link) lines.push(entry.link);
      if (entry.tech.length) lines.push(entry.tech.join(", "));
      lines.push(...entry.bullets.map(bullet => `- ${bullet}`));
    }
  }
  const skills = profileSkillDisplayRows(profile);
  if (skills.length) lines.push("", "## Skills", ...skills.map(row => `${row.label ? `${row.label}: ` : ""}${row.line}`));
  if (profile.education.length) {
    lines.push("", "## Education");
    for (const entry of profile.education) {
      lines.push("", `### ${[entry.school, entry.degree].filter(Boolean).join(" — ")}`);
      const details = [entry.location, [entry.start, entry.end].filter(Boolean).join(" — ")].filter(Boolean);
      if (details.length) lines.push(details.join(" | "));
      lines.push(...entry.details.map(detail => `- ${detail}`));
    }
  }
  return lines.join("\n");
}
