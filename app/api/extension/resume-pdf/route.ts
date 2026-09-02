import { createRequire } from "module";
import { NextResponse } from "next/server";
import { z } from "zod";

import { renderJakeResumeTex } from "@/app/lib/jake-latex";
import { ProfileSchema } from "@/app/lib/profile-model";

export const runtime = "nodejs";
export const maxDuration = 120;

const require = createRequire(import.meta.url);

const BodySchema = z.object({
  profile: ProfileSchema,
  experienceBulletsById: z.record(z.string(), z.array(z.string())).default({}),
  projectBulletsById: z.record(z.string(), z.array(z.string())).default({}),
  selectedExperienceIds: z.array(z.string()).default([]),
  selectedProjectIds: z.array(z.string()).default([]),
  subsetEnabled: z.boolean().optional().default(false),
  title: z.string().optional(),
});

async function compileLatexToPdf(latex: string) {
  const { compile } = require("node-latex-compiler") as {
    compile: (c: {
      tex: string;
      returnBuffer: boolean;
    }) => Promise<{
      status: string;
      pdfBuffer?: Buffer;
      error?: string;
      stderr?: string;
    }>;
  };

  const result = await compile({ tex: latex, returnBuffer: true });

  if (result.status !== "success" || !result.pdfBuffer?.length) {
    return {
      ok: false as const,
      error: result.error ?? "LaTeX compilation failed",
      stderr: (result.stderr ?? "").slice(0, 12_000),
    };
  }

  return { ok: true as const, pdfBuffer: result.pdfBuffer };
}

/** Build a Jake-style PDF from profile + optimized bullets (Chrome extension). */
export async function POST(req: Request) {
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

  const latex = renderJakeResumeTex({
    profile,
    experienceIds: selectedExperienceIds,
    projectIds: selectedProjectIds,
    subsetEnabled,
    title,
    experienceBulletsById,
    projectBulletsById,
    highlightMetrics: true,
  });

  if (!latex.trim()) {
    return NextResponse.json({ error: "Empty LaTeX output" }, { status: 400 });
  }

  try {
    const compiled = await compileLatexToPdf(latex);
    if (!compiled.ok) {
      return NextResponse.json(
        { error: compiled.error, stderr: compiled.stderr },
        { status: 422 },
      );
    }

    return new NextResponse(new Uint8Array(compiled.pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="resume-tailored.pdf"',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Compilation error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
