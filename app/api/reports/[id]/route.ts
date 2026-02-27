import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reportDetailResponseSchema } from "@/lib/schemas/api";
import { runReportExpiration } from "@/lib/server/reports";

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

  const validated = reportDetailResponseSchema.parse({
    report: data[0]
  });

  return NextResponse.json(validated);
}
