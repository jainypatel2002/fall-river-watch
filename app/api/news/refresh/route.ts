import { NextResponse } from "next/server";
import { runNewsIngest } from "@/lib/server/newsIngest";
import { getUserRole } from "@/lib/server/roles";
import { requireAuth } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST() {
  const auth = await requireAuth();
  if (!auth.user) {
    console.warn("[news.refresh] Unauthorized refresh request");
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const role = await getUserRole(auth.supabase, auth.user.id);
  if (role !== "admin" && role !== "mod") {
    console.warn("[news.refresh] Forbidden refresh request", { userId: auth.user.id, role });
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const startedAt = Date.now();
  console.info("[news.refresh] Starting admin refresh", { userId: auth.user.id, role });

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
      console.warn("[news.refresh] Completed with source-level errors", { userId: auth.user.id, sourceErrors });
    }

    console.info("[news.refresh] Completed admin refresh", {
      userId: auth.user.id,
      role,
      inserted: result.inserted,
      skipped: result.skipped,
      sources: result.sources,
      tookMs: result.tookMs
    });
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
    console.error("[news.refresh] Admin refresh failed", {
      userId: auth.user.id,
      role,
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
