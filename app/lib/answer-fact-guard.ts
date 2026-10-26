import type { Profile } from './profile-model';
import { contentWords } from './resume-fact-guard';

/** Detect the unsupported cache-policy details observed in live essay tests.
 * Absence from the supplied factual context rejects the answer; this narrow
 * check is not a general semantic verifier for application essays.
 */
export function hasUnsupportedCachePolicy(answer: string, factualContext: string): boolean {
  return [ /\bTTL\b|\btime[ -]to[ -]live\b/i, /\binvalidat(?:e|ed|ing|ion)\b/i ]
    .some(term => term.test(answer) && !term.test(factualContext));
}


/** For past-work questions, novel details fall back to the best supported
 * entry's own bullets. Forward-looking motivation/idea questions are unchanged.
 * Conservative vocabulary checks are not complete semantic verification.
 */
export function groundExperienceAnswer(answer: string, question: string,
  profile: Pick<Profile, 'experience' | 'projects'>, personalContext = '', draftAnswer = '', maxChars = 0): string | null {
  if (!/challenge|describe|tell.*(?:time|experience)|example|past work|previous.*(?:role|job)/i.test(question)) return answer;
  const narrative = new Set('i me my we our us at work worked working following included involved chose decided change changed noticed typical after before once together also had have has having would could can did do does made make it this that helped about'.split(' '));
  const entries = [
    ...profile.experience.map(e => ({ label: e.company, bullets: e.bullets })),
    ...profile.projects.map(p => ({ label: p.name, bullets: p.bullets })),
  ].filter(e => e.bullets.length);
  const answerWords = contentWords(answer);
  const ranked = entries.map(entry => {
    const evidence = contentWords(entry.label + ' ' + entry.bullets.join(' '));
    const score = [...answerWords].filter(w => evidence.has(w)).length +
      (entry.label && answer.toLowerCase().includes(entry.label.toLowerCase().replace(/ \(synthetic\)$/, '')) ? 100 : 0);
    return { ...entry, score };
  }).sort((a, b) => b.score - a.score);
  const entry = ranked[0];
  if (!entry || entry.score < 3) return answer;
  const evidence = contentWords([entry.label, ...entry.bullets, personalContext, draftAnswer].join(' '));
  if ([...answerWords].every(word => evidence.has(word) || narrative.has(word))) return answer;
  const prefix = `My work at ${entry.label} included: `;
  const selected: string[] = [];
  for (const bullet of entry.bullets) {
    if (!maxChars || (prefix + [...selected, bullet].join(' ')).length <= maxChars) selected.push(bullet);
  }
  return selected.length ? prefix + selected.join(' ') : null;
}
