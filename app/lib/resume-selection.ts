import type { Profile } from './profile-model';
import { segmentJd } from './jd-sections';
import { extractJdKeywordsDeterministic } from './jd-keyword-extract';

const normalize = (text: string) => text.toLowerCase()
  .replace(/node\.js/g, 'nodejs').replace(/next\.js/g, 'nextjs')
  .replace(/ci\s*\/\s*cd/g, 'cicd').replace(/accessibility/g, 'accessible')
  .replace(/\bpostgres\b/g, 'postgresql').replace(/[^a-z0-9+#]+/g, ' ').trim();
const contains = (text: string, term: string) => (` ${normalize(text)} `).includes(` ${normalize(term)} `);

/** Ground automatic selection in explicit required qualifications. Role-title
 * technologies get extra weight; model ordering breaks ties. With unstructured
 * JDs we preserve the model selection instead of guessing at requirements.
 */
export function selectByRequiredEvidence(profile: Pick<Profile, 'experience' | 'projects'>,
  jd: string, modelExperienceIds: string[], modelProjectIds: string[]) {
  const requiredText = segmentJd(jd).filter(section =>
    /^(?:(?:required|minimum|basic)\s+)?(?:qualifications|requirements|skills)\b/.test(section.heading)
  ).map(section => section.body).join('\n');
  if (!requiredText) return { experienceIds: modelExperienceIds, projectIds: modelProjectIds };
  const conciseTerms = requiredText.split('\n').flatMap(line => {
    const match = line.match(/^\s*[-*•]\s+(.+?)\s*$/);
    return match && match[1].length <= 40 && match[1].split(/\s+/).length <= 4 ? [match[1]] : [];
  });
  const required = [...new Set([...extractJdKeywordsDeterministic(requiredText), ...conciseTerms].map(normalize))].filter(Boolean);
  if (!required.length) return { experienceIds: modelExperienceIds, projectIds: modelProjectIds };
  const title = jd.split('\n').find(line => line.trim()) || '';
  const primary = extractJdKeywordsDeterministic(title).map(normalize);
  const covered = new Set<string>();
  function pick(entries: Array<{ id: string; bullets: string[]; tech?: string[] }>, modelIds: string[], count: number) {
    const candidates = entries.map((entry, order) => {
      const evidence = [...entry.bullets, ...(entry.tech || [])].join(' ');
      return { id: entry.id, order, matches: required.filter(term => contains(evidence, term)), primary: primary.filter(term => contains(evidence, term)).length };
    });
    const chosen: string[] = [];
    while (chosen.length < Math.min(count, candidates.length)) {
      const remaining = candidates.filter(entry => !chosen.includes(entry.id));
      const score = (entry: typeof candidates[number]) => entry.primary * 6 + entry.matches.length + entry.matches.filter(term => !covered.has(term)).length * 3;
      remaining.sort((a, b) => score(b) - score(a) ||
        (modelIds.includes(a.id) ? modelIds.indexOf(a.id) : modelIds.length + a.order) -
        (modelIds.includes(b.id) ? modelIds.indexOf(b.id) : modelIds.length + b.order));
      const best = remaining[0]; chosen.push(best.id); best.matches.forEach(term => covered.add(term));
    }
    return chosen;
  }
  const experienceIds = pick(profile.experience, modelExperienceIds, 4);
  return { experienceIds, projectIds: pick(profile.projects, modelProjectIds, 2) };
}
