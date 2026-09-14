import { createRequire } from "module";
import { NextResponse } from "next/server";
import { z } from "zod";

import { currentUserId } from "@/auth";

export const runtime = "nodejs";
export const maxDuration = 120;

const require = createRequire(import.meta.url);

const BodySchema = z.object({
  latex: z.string().max(1_500_000),
});

/**
 * Only signed-in pages call this (resumes/[id], optimize/resume both compile
 * client-side and POST the result here) — gating it stops an unauthenticated
 * caller from spawning arbitrary LaTeX-compile processes at will.
 */
export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.flatten().fieldErrors.latex?.[0] ??
          "Invalid request body",
      },
      { status: 400 }
    );
  }

  const { latex } = parsed.data;
  if (!latex.trim()) {
    return NextResponse.json(
      { error: "Field latex must be a non-empty string" },
      { status: 400 }
    );
  }

  try {
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
      return NextResponse.json(
        {
          error: result.error ?? "LaTeX compilation failed",
          stderr: (result.stderr ?? "").slice(0, 12_000),
        },
        { status: 422 }
      );
    }

    return new NextResponse(new Uint8Array(result.pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="resume.pdf"',
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Compilation error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
