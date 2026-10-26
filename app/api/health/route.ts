import { NextResponse } from "next/server";
export function GET() {
  return NextResponse.json({ status: "ok", storage: "device-default" }, { headers: { "Cache-Control": "no-store" } });
}
