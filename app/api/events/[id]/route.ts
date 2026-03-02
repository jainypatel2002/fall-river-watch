import { NextResponse } from "next/server";
import { updateEventSchema } from "@/lib/schemas/events";
import { getUserRole } from "@/lib/server/roles";
import { enrichEventsWithMeta } from "@/lib/server/events";
import { requireAuth } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const supabase = await createSupabaseServerClient();

    const {
      data: { user }
    } = await supabase.auth.getUser();

    const role = user ? await getUserRole(supabase, user.id) : null;
    const isMod = role === "mod" || role === "admin";

    const { data: eventRow, error } = await supabase.from("events").select("*").eq("id", id).maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!eventRow) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const events = await enrichEventsWithMeta({
      supabase,
      events: [eventRow],
      userId: user?.id ?? null,
      isMod
    });

    if (!events.length) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    return NextResponse.json({ event: events[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    const body = await request.json();
    const payload = updateEventSchema.parse(body);

    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(payload)) {
      patch[key] = value ?? null;
    }

    const { data: updated, error } = await auth.supabase.from("events").update(patch).eq("id", id).select("*").maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!updated) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const role = await getUserRole(auth.supabase, auth.user.id);
    const events = await enrichEventsWithMeta({
      supabase: auth.supabase,
      events: [updated],
      userId: auth.user.id,
      isMod: role === "mod" || role === "admin"
    });

    return NextResponse.json({ event: events[0] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    const { error } = await auth.supabase.from("events").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
