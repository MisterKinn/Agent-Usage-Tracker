import { NextResponse } from "next/server";
import { TRACKER_CLIENT_VERSION } from "@/lib/tracker-version";

export async function GET() {
  return NextResponse.json({
    ok: true,
    trackerVersion: TRACKER_CLIENT_VERSION,
  });
}
