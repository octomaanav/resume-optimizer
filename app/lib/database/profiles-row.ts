import {
  ProfileSchema,
  migrateLegacyProfileSkills,
  type Profile,
} from "@/app/lib/profile-model";
import type { ProfileRow } from "@/app/lib/db/schema";

/** Profile → row values for insert/update. Keys match the Drizzle schema. */
export function profileToRow(userId: string, p: Profile) {
  return {
    id: userId,
    name: p.name,
    email: p.email ?? "",
    phone: p.phone ?? "",
    location: p.location ?? "",
    summary: p.summary ?? "",
    links: p.links,
    skills: p.skills,
    skillCategories: p.skillCategories ?? [],
    experience: p.experience,
    projects: p.projects,
    education: p.education,
  };
}

/** Row → validated Profile, applying the legacy flat-skills migration. */
export function rowToProfile(row: ProfileRow): Profile {
  return migrateLegacyProfileSkills(
    ProfileSchema.parse({
      name: row.name ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      location: row.location ?? "",
      summary: row.summary ?? "",
      links: row.links ?? [],
      skills: row.skills ?? [],
      skillCategories: row.skillCategories ?? [],
      experience: row.experience ?? [],
      projects: row.projects ?? [],
      education: row.education ?? [],
    }),
  );
}
