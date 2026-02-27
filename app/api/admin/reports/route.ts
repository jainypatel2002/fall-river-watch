import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { runReportExpiration } from "@/lib/server/reports";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;
  await runReportExpiration(auth.supabase);

  const url = new URL(request.url);
  const search = url.searchParams.get("search")?.trim() ?? "";
  const status = url.searchParams.get("status")?.trim() ?? "";
  const category = url.searchParams.get("category")?.trim() ?? "";

  let query = auth.supabase
    .from("reports")
    .select("id, reporter_id, category, title, description, severity, status, created_at, expires_at")
    .order("created_at", { ascending: false })
    .limit(250);

  if (status) query = query.eq("status", status);
  if (category) query = query.eq("category", category);
  if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ reports: data ?? [] });
}
