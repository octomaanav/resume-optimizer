/**
 * prompts.ts — MCP prompts. These surface as slash commands in Claude and give
 * the agent the orchestration ORDER, which it otherwise guesses wrong on the
 * first attempt (typically compiling a PDF before the human review gate).
 */

export type PromptDef = {
  name: string;
  title: string;
  description: string;
  arguments: Array<{ name: string; description: string; required: boolean }>;
  build: (args: Record<string, string>) => string;
};

export const PROMPTS: PromptDef[] = [
  {
    name: "apply_to_job",
    title: "Apply to a job",
    description:
      "Run the full application pipeline: read the job, tailor the resume, answer every " +
      "question, fill the form and attach the PDF. Never submits.",
    arguments: [
      { name: "jd", description: "Job description text. Omit to read it from the active browser tab.", required: false },
      { name: "notes", description: "Anything to emphasise, e.g. 'lean on my backend work'.", required: false },
    ],
    build: (args) => {
      const jd = args.jd?.trim();
      // Mirrors HANDS_FREE in tools.ts: the pipeline runs start to finish and
      // narrates itself, instead of stopping twice for a click.
      const handsFree = process.env.RO_HANDS_FREE !== "0";
      return [
        "Run the job application pipeline in this exact order. Do not reorder or skip steps.",
        "",
        "1. Call get_profile so you know what the user has actually done.",
        jd
          ? "2. Use the job description supplied below."
          : "2. Call get_active_job_context to read the job description and form fields from the active tab.",
        "3. Call extract_jd_keywords on the job description and note which keywords the profile already covers.",
        "4. Call optimize_resume. Keep the returned optimizationId.",
        "5. Show the user the rewritten bullets in your reply, then call review_resume_draft.",
        handsFree
          ? "   Do not stop for an answer — keep going in the same turn."
          : "   STOP. Wait for the user to approve before continuing.",
        "6. Call build_resume_pdf with the same optimizationId.",
        "7. Call autofill_page — ONE call that re-reads the form, resolves every field and fills",
        "   it. Do not call get_active_job_context and fill_application_form yourself to do this:",
        "   ATS selectors change between page loads, so anything you captured earlier is stale.",
        "   Do not call answer_application_question field by field first; autofill_page resolves",
        "   every answer itself and one call is far faster than a dozen.",
        "8. Call attach_resume with the pdfId. Report autofill_page's `needsUser` list to the user.",
        "",
        "Never submit the application. There is no tool for it, and there should not be.",
        "Never invent a metric, employer, date or credential that is not in the profile.",
        "",
        handsFree
          ? "Run steps 1-8 without stopping to ask. The user watches the fill land field by field" +
            " in the page and presses submit themselves, so there is nothing to confirm mid-run."
          : "Ask the user exactly two things: the resume review at step 5 and the fill approval at" +
            " step 7.",
        "Which roles or projects to include is optimize_resume's decision, not yours and not the",
        "user's — do not offer choices about resume content. If a tool fails, report the failure",
        "and stop; never do that tool's job by hand. The one other reason to stop is a blocker",
        "only the user can clear, such as the browser being on the job listing rather than the",
        "application form.",
        args.notes?.trim() ? `\nUser notes: ${args.notes.trim()}` : "",
        jd ? `\n--- JOB DESCRIPTION ---\n${jd}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    },
  },
  {
    name: "tailor_resume_only",
    title: "Tailor resume only",
    description: "Optimize the resume against a job description and stop at the review gate.",
    arguments: [{ name: "jd", description: "Job description text.", required: true }],
    build: (args) =>
      [
        "Call get_profile, then optimize_resume with the job description below.",
        "Show me every rewritten bullet next to what it replaced, then call review_resume_draft.",
        "Do not build a PDF until I approve.",
        "",
        "--- JOB DESCRIPTION ---",
        args.jd ?? "",
      ].join("\n"),
  },
];

export function findPrompt(name: string): PromptDef | undefined {
  return PROMPTS.find((p) => p.name === name);
}
