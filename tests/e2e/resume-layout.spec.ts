import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { compile } from 'node-latex-compiler';
import { fitResumeToPageLimit } from '../../app/lib/resume-pdf-fit';

test('saved tailored resume uses readable type and preserves every selected bullet on one page', async () => {
  test.skip(!fs.existsSync('artifacts/groq-audit/generation.json'), 'Requires the saved Groq audit output');
  const profile = JSON.parse(fs.readFileSync('tests/fixtures/cs-candidate.json', 'utf8'));
  const generated = JSON.parse(fs.readFileSync('artifacts/groq-audit/generation.json', 'utf8'));
  const result = await fitResumeToPageLimit({ profile, ...generated,
    experienceIds: generated.selectedExperienceIds, projectIds: generated.selectedProjectIds,
    subsetEnabled: true, highlightMetrics: true,
    compile: async tex => {
      const output = await compile({ tex, returnBuffer: true });
      if (output.status !== 'success' || !output.pdfBuffer) throw new Error(output.error || 'Compilation failed');
      return new Uint8Array(output.pdfBuffer);
    },
  });
  expect(result.pages).toBe(1);
  expect(result.bulletsDropped).toBe(0);
  expect(result.latex).toContain('letterpaper,11pt');
  fs.writeFileSync('artifacts/groq-audit/tailored-readable.pdf', result.pdfBytes);
  execFileSync('/opt/homebrew/bin/pdftotext', ['-layout', 'artifacts/groq-audit/tailored-readable.pdf', 'artifacts/groq-audit/tailored-readable.txt']);
});
