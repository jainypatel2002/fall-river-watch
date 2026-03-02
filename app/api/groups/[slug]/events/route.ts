import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      error: "Group events have been removed. Use /events for global events."
    },
    { status: 410 }
  );
}
