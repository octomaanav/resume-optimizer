import { NextResponse } from "next/server";
import { extractJdKeywordsDeterministic } from "@/app/lib/jd-keyword-extract";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const jd =
    body && typeof body === "object" && "jd" in body
      ? String((body as { jd?: unknown }).jd ?? "")
      : "";

  const keywords = extractJdKeywordsDeterministic(jd.slice(0, 12000));
  return NextResponse.json({ keywords });
}
