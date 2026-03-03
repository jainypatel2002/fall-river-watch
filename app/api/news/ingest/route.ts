import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runNewsIngestion } from "@/lib/server/news/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function safeSecretCompare(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) {
    return false;
  }

  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const providedSecret = url.searchParams.get("secret");
  const expectedSecret = process.env.NEWS_INGEST_SECRET;

  if (!expectedSecret) {
    return NextResponse.json({ ok: false, error: "Server ingest secret is not configured" }, { status: 500 });
  }

  if (!safeSecretCompare(providedSecret, expectedSecret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runNewsIngestion();
    return NextResponse.json(result, {
      status: result.ok ? 200 : 500,
      headers: {
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected ingest failure";
    return NextResponse.json(
      {
        ok: false,
        items_inserted: 0,
        items_skipped: 0,
        per_source: [],
        run_id: null,
        error: message
      },
      { status: 500 }
    );
  }
}
