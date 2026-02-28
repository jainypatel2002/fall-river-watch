import { NextResponse } from "next/server";
import { notificationSettingsSchema } from "@/lib/schemas/report";
import { requireAuth } from "@/lib/supabase/auth";
import { normalizeTo24HourHHMM } from "@/lib/time/normalizeQuietHours";

export async function GET() {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { data, error } = await auth.supabase
    .from("notification_subscriptions")
    .select("user_id, channels, radius_miles, categories, quiet_start, quiet_end, enabled")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const formattedData = data ? {
    ...data,
    quiet_hours: {
      start: data.quiet_start,
      end: data.quiet_end
    }
  } : null;

  return NextResponse.json({ settings: formattedData });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const body = await request.json();

    // Fallback normalization for quiet hours in case client sends AM/PM format
    if (body?.quiet_hours) {
      if (typeof body.quiet_hours.start === "string") {
        body.quiet_hours.start = normalizeTo24HourHHMM(body.quiet_hours.start) || body.quiet_hours.start;
      }
      if (typeof body.quiet_hours.end === "string") {
        body.quiet_hours.end = normalizeTo24HourHHMM(body.quiet_hours.end) || body.quiet_hours.end;
      }
    }

    const payload = notificationSettingsSchema.parse(body);

    const { error } = await auth.supabase.from("notification_subscriptions").upsert(
      {
        user_id: auth.user.id,
        channels: payload.channels,
        radius_miles: payload.radius_miles,
        categories: payload.categories,
        quiet_start: payload.quiet_hours.start,
        quiet_end: payload.quiet_hours.end,
        enabled: payload.enabled
      },
      { onConflict: "user_id" }
    );

    if (error) {
      if (error.code === "42501") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
