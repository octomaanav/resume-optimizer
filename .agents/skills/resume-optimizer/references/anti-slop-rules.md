# Anti-Slop Rules — Writing That Sounds Human

Recruiters and hiring managers can spot AI-generated resume content in seconds. These rules exist to prevent that.
The goal is not to hide that AI was used — it's to produce content that reflects a real person's real experience,
written in a direct, specific, confident voice.

---

## The Slop Test

Before finalizing any bullet or paragraph, apply this test:

> **"Could this sentence describe almost anyone in the same role?"**

If yes → it's slop. Rewrite with a specific project, tool, metric, or outcome.

> **"Would a human recruiter find this awkward to say out loud?"**

If yes → it's AI phrasing. Simplify it.

> **"Does this contain a metric I can defend in an interview?"**

If no → either add a defensible number or improve the specificity in another way.

---

## Banned Phrases (Never Use)

These phrases appear in nearly every AI-generated resume. Their presence is a red flag to recruiters.

### Power-empty buzzwords
- "Results-driven"
- "Detail-oriented"
- "Passionate about"
- "Highly motivated"
- "Dynamic"
- "Synergies" / "Synergy"
- "Leverage" / "Leveraged" (as a standalone buzzword)
- "Utilize" / "Utilized" (say "use" / "used")
- "Impactful" (show the impact instead)
- "Holistic"
- "Robust"
- "Scalable solutions" (unless you're describing specific architecture)
- "Value-add"
- "Move the needle"

### AI-generated corporate speak
- "Spearheaded cross-functional initiatives" (if no specifics follow)
- "Collaborated with stakeholders" (vague — name who, toward what)
- "Drove alignment across teams"
- "Fostered a culture of..."
- "Championed best practices"
- "Proactively identified opportunities"
- "Streamlined processes to enhance efficiency" (what process? what efficiency gain?)
- "Delivered high-quality results"
- "Provided strategic guidance"
- "Instrumental in driving..."

### Passive / responsibility framing (not achievement framing)
- "Responsible for X"
- "Tasked with X"
- "Managed day-to-day operations of X" (without outcome)
- "Oversaw X" (without result)
- "Assisted in X"
- "Supported the team in X"
- "Involved in X"

### Filler phrases that add no information
- "Successfully" (if it's in a bullet, it was successful by definition)
- "Effectively" (same problem)
- "In a timely manner"
- "As needed"
- "Various"
- "Multiple stakeholders"
- "Numerous"
- "A variety of"

---

## Structural AI Tells to Avoid

### Same verb, every bullet
Bad:
- "Developed X..."
- "Developed Y..."
- "Developed Z..."

Good: Rotate verbs and sentence structures throughout.

### Bullet starts with a gerund (-ing word)
Bad: "Managing a team of 5 engineers..."
Good: "Managed a team of 5 engineers..." (past tense, action-first)

### Overly formal / stiff phrasing
Bad: "Facilitated the implementation of organizational-wide knowledge management systems"
Good: "Built an internal wiki used by 200+ employees to find answers without pinging the engineering team"

### Excessive scope inflation with no grounding
Bad: "Drove company-wide digital transformation initiative resulting in significant operational improvements"
Good: "Led migration of 3 legacy reporting tools to Tableau, giving 80 analysts self-serve access and saving 6 hrs/week of manual pulls"

### Listing too many skills/tools in one bullet
Bad: "Utilized Python, SQL, Tableau, Salesforce, Jira, Confluence, and Slack to manage cross-functional projects"
Good: Keep tools to the 1–2 most relevant per bullet. Put the rest in a Skills section.

### Paragraphs instead of bullets
On a resume, dense paragraphs = AI red flag. Always convert to bullets.
In a cover letter, 2–4 tight paragraphs is the right format.

---

## Human Voice Techniques

### Be specific about the project or context
Instead of: "Improved customer onboarding process"
Write: "Redesigned the onboarding email sequence for enterprise customers, cutting time-to-first-value from 14 days to 6"

### Name the constraint or problem
Instead of: "Built new analytics dashboard"
Write: "Built a real-time spend dashboard after stakeholders complained about waiting 3 days for weekly reports — dashboard now loads in under 2 seconds"

### Show the scale of your audience or collaborators
Instead of: "Presented findings to leadership"
Write: "Presented quarterly churn analysis to a 12-person executive team, leading to a $500K investment in retention tooling"

### Use natural numbers, not suspiciously round ones
"Reduced time by 47%" feels more credible than "Reduced time by 50%"
"Grew revenue by $1.3M" feels more real than "Grew revenue by $1.5M"
(Use round numbers when they're genuinely accurate — just be aware of the optics)

### Avoid executive language for non-executive roles
Entry-level: "Built", "Developed", "Wrote", "Analyzed"
Mid-level: "Led", "Owned", "Designed", "Launched"
Senior: "Architected", "Defined strategy", "Built and scaled", "Drove org-wide adoption"

Mismatched seniority language is a red flag — it signals AI didn't match the candidate's actual level.

---

## Cover Letter Anti-Slop Rules

Cover letters have different failure modes from resumes:

**Don't**: "I am writing to express my interest in the [Role] position at [Company]. I believe my skills and experience make me an excellent candidate."
→ This is the #1 AI cover letter opener. Recruiters skip past it instantly.

**Do**: Open with a specific hook — a result you achieved, a reason you're drawn to this company's work, or a connection to the role's core challenge.

**Don't**: Restate your resume bullet by bullet in prose form.
**Do**: Pick 2–3 themes from the JD and write one paragraph each showing you've solved that kind of problem before.

**Don't**: End with "I look forward to discussing how I can contribute to your team's success."
**Do**: End with a confident, specific ask or forward-looking statement that shows you've thought about the role.

---

## LinkedIn Anti-Slop Rules

**Headline**: Don't just list your job title. Include what you do + who you help + a signal of impact.
- Bad: "Software Engineer at Acme Corp"
- Good: "Full-Stack Engineer | Building data-intensive products | Previously scaled X from 0→100K users"

**About section**: Write in first person. This is the one place on the resume where personality is expected.
- Bad: "Results-driven professional with 7+ years of experience in..."
- Good: "I build things that make data useful. For the past 5 years I've been working at the intersection of..."

**Experience bullets**: Same XYZ rules apply. LinkedIn bullets can be slightly more conversational than a formal resume.

---

## Final Output Check

Before returning any content to the user, run this list:

- [ ] No banned phrases appear anywhere
- [ ] No bullet starts with the same verb as the bullet above or below it
- [ ] Every bullet contains something specific (tool, project, number, person count, outcome)
- [ ] The content would survive a 60-second read by a skeptical recruiter
- [ ] Cover letter opener does NOT begin with "I am writing to express..."
- [ ] Seniority of language matches the candidate's actual level
- [ ] Nothing in the output could not be defended in a 30-minute interview
