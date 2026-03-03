import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runNewsIngest } from "@/lib/server/newsIngest";

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
  const querySecret = url.searchParams.get("secret");
  const authorization = request.headers.get("authorization");
  const bearerSecret =
    authorization && authorization.toLowerCase().startsWith("bearer ")
      ? authorization.slice("bearer ".length).trim()
      : null;
  const providedSecret = querySecret || bearerSecret;
  const expectedSecret = process.env.NEWS_INGEST_SECRET;

  if (!expectedSecret) {
    console.error("[news.ingest] NEWS_INGEST_SECRET is not configured");
    return NextResponse.json({ ok: false, error: "Server ingest secret is not configured" }, { status: 500 });
  }

  if (!safeSecretCompare(providedSecret, expectedSecret)) {
    console.warn("[news.ingest] Unauthorized ingest request");
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  console.info("[news.ingest] Starting ingest run");

  try {
    const result = await runNewsIngest();
    const sourceErrors = (result.details ?? [])
      .filter((detail) => detail.error)
      .map((detail) => ({
        sourceId: detail.sourceId,
        sourceName: detail.sourceName,
        error: detail.error
      }));

    if (sourceErrors.length > 0) {
      console.warn("[news.ingest] Completed with source-level errors", { sourceErrors });
    }

    console.info(
      `[news.ingest] Completed ingest run in ${result.tookMs}ms. inserted=${result.inserted}, skipped=${result.skipped}, sources=${result.sources}`
    );

    return NextResponse.json(
      {
        ok: true,
        inserted: result.inserted,
        skipped: result.skipped,
        sources: result.sources,
        tookMs: result.tookMs,
        details: result.details
      },
      {
        status: 200,
        headers: {
          "cache-control": "no-store"
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected ingest failure";
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[news.ingest] Ingest failed", {
      tookMs: Date.now() - startedAt,
      error: message,
      stack
    });
    return NextResponse.json(
      {
        ok: false,
        error: message
      },
      {
        status: 500,
        headers: {
          "cache-control": "no-store"
        }
      }
    );
  }
}
