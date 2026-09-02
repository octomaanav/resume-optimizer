import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ProfileSchema,
  migrateLegacyProfileSkills,
  type Profile,
  emptyProfile,
} from "@/app/lib/profile-model";

export type ProfilesTableRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  links: unknown;
  skills: unknown;
  skill_categories: unknown;
  experience: unknown;
  projects: unknown;
  education: unknown;
  created_at: string;
  updated_at: string;
};

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
    skill_categories: p.skillCategories ?? [],
    experience: p.experience,
    projects: p.projects,
    education: p.education,
  };
}

export function rowToProfile(row: ProfilesTableRow): Profile {
  return migrateLegacyProfileSkills(
    ProfileSchema.parse({
      name: row.name ?? "",
      email: row.email ?? "",
      phone: row.phone ?? "",
      location: row.location ?? "",
      summary: row.summary ?? "",
      links: row.links ?? [],
      skills: row.skills ?? [],
      skillCategories: row.skill_categories ?? [],
      experience: row.experience ?? [],
      projects: row.projects ?? [],
      education: row.education ?? [],
    }),
  );
}

/** Insert default profile row if missing (RLS: own id only). */
export async function ensureDefaultProfileRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ error: Error | null }> {
  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (existing) return { error: null };

  const row = profileToRow(userId, emptyProfile());
  const { error } = await supabase.from("profiles").insert(row);
  return { error: error ? new Error(error.message) : null };
}
