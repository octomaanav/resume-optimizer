import { z } from "zod";

const text = z.string().trim().min(1);
const bullets = z.record(z.string(), z.array(text));
const selection = {
  selectedExperienceIds: z.array(z.string()),
  selectedProjectIds: z.array(z.string()),
};

/** Validate model output before clients render it or save it as a document. */
export function parseAiOutput(
  value: unknown,
  input: { kind: "resume" | "coverLetter" | "applicationAnswer" | "profileBullet"; mode: "select" | "bullets"; selectBest: boolean },
) {
  if (input.kind === "profileBullet") {
    return z.object({ optimizedBullet: text }).parse(value);
  }
  if (input.kind === "applicationAnswer") {
    return z.object({ optimizedAnswer: text }).parse(value);
  }
  if (input.kind === "coverLetter") {
    return z.object({ title: z.string().optional(), companyName: z.string().optional(), outputMarkdown: text }).parse(value);
  }
  if (input.mode === "bullets") {
    const schema = z.object({
      experienceBulletsById: bullets,
      projectBulletsById: bullets,
      bulletRationaleByKey: z.record(z.string(), z.string()).optional(),
    });
    return (input.selectBest ? schema.extend(selection) : schema).parse(value);
  }
  return z.object({ ...selection, title: z.string().optional(), outputMarkdown: text }).parse(value);
}
