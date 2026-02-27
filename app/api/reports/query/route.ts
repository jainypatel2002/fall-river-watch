import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reportFiltersSchema } from "@/lib/schemas/report";
import { reportsQueryResponseSchema } from "@/lib/schemas/api";
import { getTimeWindowHours, runReportExpiration } from "@/lib/server/reports";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const filters = reportFiltersSchema.parse(body);

    const supabase = await createSupabaseServerClient();
    await runReportExpiration(supabase);

    const { data, error } = await supabase.rpc("get_reports_nearby", {
      p_center_lat: filters.centerLat,
      p_center_lng: filters.centerLng,
      p_radius_miles: filters.radiusMiles,
      p_categories: filters.categories,
      p_verified_only: filters.verifiedOnly,
      p_hours: getTimeWindowHours(filters.timeWindow)
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const validated = reportsQueryResponseSchema.parse({
      reports: data ?? []
    });

    return NextResponse.json(validated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
