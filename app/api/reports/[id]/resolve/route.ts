import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { id } = await context.params;

  const [{ data: report }, { data: profile }] = await Promise.all([
    auth.supabase.from("reports").select("id, reporter_id, status").eq("id", id).single(),
    auth.supabase.from("profiles").select("role").eq("id", auth.user.id).single()
  ]);

  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const canResolve = report.reporter_id === auth.user.id || ["admin", "mod"].includes(profile?.role ?? "");

  if (!canResolve) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await auth.supabase.from("reports").update({ status: "resolved" }).eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
