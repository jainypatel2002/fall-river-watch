import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reportDetailResponseSchema } from "@/lib/schemas/api";
import { runReportExpiration } from "@/lib/server/reports";

const ANONYMOUS_REPORTER_ID = "00000000-0000-0000-0000-000000000000";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();

  await runReportExpiration(supabase);

  const { data, error } = await supabase.rpc("get_report_detail", { p_report_id: id });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const { data: reportRow, error: reportError } = await supabase.from("reports").select("is_anonymous").eq("id", id).maybeSingle();
  if (reportError) {
    return NextResponse.json({ error: reportError.message }, { status: 500 });
  }

  const row = data[0] as Record<string, unknown>;
  const sanitized = reportRow?.is_anonymous
    ? {
        ...row,
        reporter_id: ANONYMOUS_REPORTER_ID
      }
    : row;

  const validated = reportDetailResponseSchema.parse({
    report: sanitized
  });

  return NextResponse.json(validated);
}
