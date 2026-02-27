import { NextResponse } from "next/server";
import { notificationSettingsSchema } from "@/lib/schemas/report";
import { requireAuth } from "@/lib/supabase/auth";

export async function GET() {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { data, error } = await auth.supabase
    .from("notification_subscriptions")
    .select("user_id, channels, radius_miles, categories, quiet_hours, enabled")
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ settings: data });
}

export async function PUT(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const payload = notificationSettingsSchema.parse(body);

    const { error } = await auth.supabase.from("notification_subscriptions").upsert(
      {
        user_id: auth.user.id,
        channels: payload.channels,
        radius_miles: payload.radius_miles,
        categories: payload.categories,
        quiet_hours: payload.quiet_hours,
        enabled: payload.enabled
      },
      { onConflict: "user_id" }
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
