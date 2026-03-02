import { NextResponse } from "next/server";
import { createEventSchema, listEventsQuerySchema } from "@/lib/schemas/events";
import { enrichEventsWithMeta } from "@/lib/server/events";
import { getUserRole } from "@/lib/server/roles";
import { requireAuth } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function validateSupabaseEnv() {
  const required = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
  const missing = required.filter((key) => !process.env[key]);
  if (!missing.length) return null;
  return `Missing required Supabase environment variables: ${missing.join(", ")}`;
}

function normalizeSearchParams(searchParams: URLSearchParams) {
  return listEventsQuerySchema.safeParse({
    range: searchParams.get("range") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    q: searchParams.get("q") ?? undefined
  });
}

function rangeBounds(range: "today" | "week" | "all") {
  const now = new Date();

  if (range === "today") {
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    return { from: dayStart.toISOString(), to: dayEnd.toISOString() };
  }

  if (range === "week") {
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return { from: now.toISOString(), to: weekEnd.toISOString() };
  }

  return null;
}

export async function GET(request: Request) {
  const envError = validateSupabaseEnv();
  if (envError) {
    return NextResponse.json({ ok: false, error: envError }, { status: 500 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const url = new URL(request.url);
    const parsed = normalizeSearchParams(url.searchParams);

    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid query parameters",
          details: parsed.error.flatten()
        },
        { status: 400 }
      );
    }

    const filters = parsed.data;

    let query = supabase.from("events").select("*").order("start_at", { ascending: true }).limit(300);

    if (filters.category) {
      query = query.eq("category", filters.category);
    }

    if (filters.q) {
      const search = filters.q.replace(/[%_]/g, "").trim();
      if (search.length) {
        query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,location_name.ilike.%${search}%`);
      }
    }

    const bounds = rangeBounds(filters.range);
    if (bounds) {
      query = query.gte("start_at", bounds.from).lt("start_at", bounds.to);
    }

    const { data: eventRows, error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    const {
      data: { user }
    } = await supabase.auth.getUser();

    const role = user ? await getUserRole(supabase, user.id) : null;
    const isMod = role === "mod" || role === "admin";

    const events = await enrichEventsWithMeta({
      supabase,
      events: (eventRows ?? []) as Parameters<typeof enrichEventsWithMeta>[0]["events"],
      userId: user?.id ?? null,
      isMod
    });

    return NextResponse.json(
      { ok: true, data: events },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store"
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const envError = validateSupabaseEnv();
  if (envError) {
    return NextResponse.json({ ok: false, error: envError }, { status: 500 });
  }

  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const payload = createEventSchema.parse(body);

    const { data: inserted, error } = await auth.supabase
      .from("events")
      .insert({
        creator_user_id: auth.user.id,
        title: payload.title,
        description: payload.description,
        category: payload.category,
        start_at: payload.start_at,
        end_at: payload.end_at ?? null,
        location_name: payload.location_name,
        address: payload.address ?? null,
        street: payload.street ?? null,
        city: payload.city,
        state: payload.state,
        zip: payload.zip ?? null,
        place_id: payload.place_id ?? null,
        formatted_address: payload.formatted_address ?? null,
        lat: payload.lat,
        lng: payload.lng,
        status: payload.status
      })
      .select("*")
      .single();

    if (error || !inserted) {
      return NextResponse.json({ ok: false, error: error?.message ?? "Failed to create event" }, { status: 400 });
    }

    const events = await enrichEventsWithMeta({
      supabase: auth.supabase,
      events: [inserted],
      userId: auth.user.id,
      isMod: false
    });

    return NextResponse.json({ ok: true, data: events[0] }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
