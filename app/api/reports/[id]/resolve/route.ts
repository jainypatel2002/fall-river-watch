import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { id } = await context.params;

  const { error } = await auth.supabase.rpc("resolve_report", { p_report_id: id });

  if (error) {
    if (error.message === "Report not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error.message === "Forbidden" || error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
