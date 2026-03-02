import { NextResponse } from "next/server";
import { eventRsvpSchema } from "@/lib/schemas/events";
import { requireAuth } from "@/lib/supabase/auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const payload = eventRsvpSchema.parse(body);

    if (payload.status === null) {
      const { error } = await auth.supabase.from("event_rsvps").delete().eq("event_id", id).eq("user_id", auth.user.id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ ok: true });
    }

    const { error } = await auth.supabase.from("event_rsvps").upsert(
      {
        event_id: id,
        user_id: auth.user.id,
        status: payload.status
      },
      {
        onConflict: "event_id,user_id"
      }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
