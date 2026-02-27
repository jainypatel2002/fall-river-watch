import { NextResponse } from "next/server";
import { createReportSchema } from "@/lib/schemas/report";
import { requireAuth } from "@/lib/supabase/auth";
import { enforceDailyLimit } from "@/lib/server/rate-limit";
import { runReportExpiration } from "@/lib/server/reports";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const payload = createReportSchema.parse(body);

    const rateCheck = await enforceDailyLimit({
      supabase: auth.supabase,
      table: "reports",
      userColumn: "reporter_id",
      userId: auth.user.id,
      limit: 5
    });

    if (!rateCheck.ok) {
      return NextResponse.json({ error: rateCheck.reason }, { status: 429 });
    }

    // Preflight profile check
    const { data: existingProfile } = await auth.supabase
      .from("profiles")
      .select("id")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (!existingProfile) {
      const { error: profileError } = await auth.supabase.from("profiles").insert({
        id: auth.user.id,
        display_name: auth.user.user_metadata?.display_name || auth.user.email?.split("@")[0] || "User",
        role: "user",
        trust_score: 0
      });

      if (profileError) {
        return NextResponse.json({ error: "Failed to create user profile" }, { status: 500 });
      }
    }

    const reportId = payload.id ?? crypto.randomUUID();

    const { error: reportError } = await auth.supabase.from("reports").insert({
      id: reportId,
      reporter_id: auth.user.id,
      category: payload.category,
      severity: payload.severity,
      title: payload.title?.trim() ? payload.title.trim() : null,
      description: payload.description,
      location: `SRID=4326;POINT(${payload.location.lng} ${payload.location.lat})`
    });

    if (reportError) {
      return NextResponse.json({ error: reportError.message }, { status: 400 });
    }

    if (payload.mediaPaths.length > 0) {
      const rows = payload.mediaPaths.map((storagePath) => ({
        report_id: reportId,
        uploader_id: auth.user.id,
        storage_path: storagePath,
        media_type: "image" as const
      }));
      const { error: mediaError } = await auth.supabase.from("report_media").insert(rows);

      if (mediaError) {
        return NextResponse.json({ error: mediaError.message }, { status: 400 });
      }
    }

    await runReportExpiration(auth.supabase);

    return NextResponse.json({ id: reportId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
