import type { Profile } from './profile-model';
import { guardResumeBulletMetrics, type MetricWarning } from './resume-metric-guard';

// Match common technology aliases as whole terms. Evidence must belong to the
// same role/project, never merely to another entry or the profile skills list.
const technologies = [
  /\bnode(?:\.js|js)?\b/i, /\breact\b/i, /\bnext(?:\.js|js)?\b/i,
  /\btypescript\b/i, /\bjavascript\b/i, /\bpython\b/i, /\bjava\b/i,
  /\bpostgres(?:ql)?\b/i, /\bredis\b/i, /\bdocker\b/i, /\baws\b/i,
  /\bcloudwatch\b/i, /\bopentelemetry\b/i, /\bplaywright\b/i, /\bjest\b/i,
  /\bgithub\s+actions\b/i, /\bci\s*\/\s*cd\b/i, /\blinux\b/i,
  /\bhtml\b/i, /\bcss\b/i, /\bsql\b/i, /\brest(?:ful)?\b/i,
  /\bkafka\b/i, /\bsnowflake\b/i, /\bairflow\b/i, /\bkubernetes\b/i,
  /\bterraform\b/i, /\bgraphql\b/i, /\bcypress\b/i, /\bvue(?:\.js)?\b/i,
];


// Unknown content words trigger a conservative source fallback. This deliberately
// favors a verifiable original over fluent but unsupported implementation or
// outcome claims. Only modest wording changes and entry-specific project tech
// are allowed; this is not a general natural-language entailment solver.
const functionWords = new Set('a an the and or of for to from in on with by at as per into across through that which its it their this these those was were is are be been being using used use via over each all both before after than then while within without'.split(' '));
const aliases: Record<string, string> = {
  built: 'build', build: 'build', developed: 'build', implemented: 'build', created: 'build',
  added: 'add', add: 'add', wrote: 'write', written: 'write', write: 'write',
  reduced: 'reduce', reducing: 'reduce', cut: 'reduce', cutting: 'reduce', lowered: 'reduce', lowering: 'reduce',
  tested: 'test', testing: 'test', tests: 'test', test: 'test',
  milliseconds: 'ms', seconds: 's', minutes: 'min',
  six: '6', five: '5', eight: '8', four: '4', three: '3', two: '2', one: '1',
};
export function contentWords(text: string): Set<string> {
  const normalized = text.normalize('NFKC').toLowerCase()
    .replace(/node\.js/g, 'nodejs').replace(/next\.js/g, 'nextjs')
    .replace(/end[‐‑–-]to[‐‑–-]end/g, 'endtoend')
    .replace(/\b\d+(?:[,.]\d+)*(?:\s*[kmb]\b)?/g, ' ');
  return new Set((normalized.match(/[a-z]+/g) ?? []).map(word => aliases[word] ?? word)
    .filter(word => !functionWords.has(word) && !/^\d+$/.test(word)));
}

/** Conservative fallback for detectable cross-entry technology attribution.
 * This complements numerical validation; it is not semantic fact verification.
 */
export function guardResumeBulletFacts(
  profile: Pick<Profile, 'experience' | 'projects'>,
  experienceMap: Record<string, string[]>,
  projectMap: Record<string, string[]>,
): MetricWarning[] {
  const warnings = guardResumeBulletMetrics(profile, experienceMap, projectMap);
  for (const [kind, entries, map] of [
    ['experience', profile.experience, experienceMap],
    ['project', profile.projects, projectMap],
  ] as const) {
    for (const [id, bullets] of Object.entries(map)) {
      const entry = entries.find(e => e.id === id);
      if (!entry) continue;
      const evidence = [entry.bullets.join(' '), 'tech' in entry ? entry.tech.join(' ') : ''].join(' ');
      map[id] = bullets.flatMap((bullet, index) => {
        const unsupported = technologies.some(term => term.test(bullet) && !term.test(evidence));
        const sourceWords = contentWords([entry.bullets[index] ?? '', 'tech' in entry ? entry.tech.join(' ') : ''].join(' '));
        const novelDetail = [...contentWords(bullet)].some(word => !sourceWords.has(word));
        if (!unsupported && !novelDetail) return [bullet];
        warnings.push({ kind, id, index, reason: unsupported
          ? 'Technology not supported by this profile entry; preserved original wording.'
          : 'Unsupported detail in rewritten bullet; preserved original wording.' });
        return entry.bullets[index] ? [entry.bullets[index]] : [];
      });
    }
  }
  return warnings;
}
