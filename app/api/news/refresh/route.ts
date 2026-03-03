import { NextResponse } from "next/server";
import { runNewsIngestion } from "@/lib/server/news/ingest";
import { getUserRole } from "@/lib/server/roles";
import { requireAuth } from "@/lib/supabase/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST() {
  const auth = await requireAuth();
  if (auth.response || !auth.user) {
    return auth.response;
  }

  const role = await getUserRole(auth.supabase, auth.user.id);
  if (role !== "admin") {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
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
