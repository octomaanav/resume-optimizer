import { compileTrustedTemplateLatex, LatexCompileError } from "@/app/lib/latex-compiler";
import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUserId } from "@/auth";

import { renderJakeResumeTex } from "@/app/lib/jake-latex";
import { ProfileSchema } from "@/app/lib/profile-model";
import { fitResumeToPageLimit } from "@/app/lib/resume-pdf-fit";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({
  profile: ProfileSchema,
  experienceBulletsById: z.record(z.string(), z.array(z.string())).default({}),
  projectBulletsById: z.record(z.string(), z.array(z.string())).default({}),
  selectedExperienceIds: z.array(z.string()).default([]),
  selectedProjectIds: z.array(z.string()).default([]),
  subsetEnabled: z.boolean().optional().default(false),
  title: z.string().optional(),
});

/** Build a Jake-style PDF from profile + optimized bullets (Chrome extension). */
export async function POST(req: Request) {
  if (!(await currentUserId())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().formErrors.join("; ") || "Invalid body" },
      { status: 400 },
    );
  }

  const {
    profile,
    experienceBulletsById,
    projectBulletsById,
    selectedExperienceIds,
    selectedProjectIds,
    subsetEnabled,
    title,
  } = parsed.data;

  const preview = renderJakeResumeTex({
    profile,
    experienceIds: selectedExperienceIds,
    projectIds: selectedProjectIds,
    subsetEnabled,
    title,
    experienceBulletsById,
    projectBulletsById,
    highlightMetrics: true,
  });

  if (!preview.trim()) {
    return NextResponse.json({ error: "Empty LaTeX output" }, { status: 400 });
  }

  try {
    const fitted = await fitResumeToPageLimit({
      profile,
      experienceIds: selectedExperienceIds,
      projectIds: selectedProjectIds,
      subsetEnabled,
      title,
      experienceBulletsById,
      projectBulletsById,
      highlightMetrics: true,
      compile: compileTrustedTemplateLatex,
      maxPages: 1,
    });

    if (!fitted.fits) {
      return NextResponse.json({
        error: "Resume cannot fit on one page. Select fewer entries or shorten the content.",
        pages: fitted.pages,
        bulletsDropped: fitted.bulletsDropped,
      }, { status: 422 });
    }

    return new NextResponse(new Uint8Array(fitted.pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="resume-tailored.pdf"',
        "X-Resume-Pages": String(fitted.pages),
        "X-Resume-Bullets-Trimmed": String(fitted.bulletsDropped),
      },
    });
  } catch (e) {
    if (e instanceof LatexCompileError) {
      return NextResponse.json(
        { error: e.message },
        { status: e.status },
      );
    }
    const message = e instanceof Error ? e.message : "Compilation error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
