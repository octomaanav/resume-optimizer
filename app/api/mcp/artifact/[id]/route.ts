/**
 * /api/mcp/artifact/[id] — downloads a PDF produced by build_resume_pdf.
 *
 * Tools return this URL instead of base64 so compiled documents never enter the
 * model's context window.
 */

import { NextResponse } from "next/server";

import { pdfArtifacts } from "@/app/lib/mcp/store";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const artifact = pdfArtifacts.get(id);

  if (!artifact) {
    return NextResponse.json(
      { error: "Artifact not found or expired (1 hour TTL)." },
      { status: 404 },
    );
  }

  return new NextResponse(new Uint8Array(artifact.bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${artifact.filename}"`,
    },
  });
}
