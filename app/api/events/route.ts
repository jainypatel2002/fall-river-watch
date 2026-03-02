import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { listEventsQuerySchema, createEventSchema } from "@/lib/schemas/events";
import { getUserRole } from "@/lib/server/roles";
import { enrichEventsWithMeta } from "@/lib/server/events";
import { requireAuth } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function normalizeSearchParams(searchParams: URLSearchParams) {
  const raw = {
    timeframe: searchParams.get("timeframe") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    groupId: searchParams.get("groupId") ?? undefined
  };

  return listEventsQuerySchema.parse(raw);
}

export async function GET(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json(
      { error: "Configuration Error", details: "Missing required Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY" },
      { status: 500 }
    );
  }

  try {
    const supabase = await createSupabaseServerClient();
    const url = new URL(request.url);
    const filters = normalizeSearchParams(url.searchParams);

    let query = supabase.from("events").select("*").order("start_at", { ascending: true }).limit(300);

    if (filters.category) {
      query = query.eq("category", filters.category);
    }

    if (filters.search) {
      const search = filters.search.replace(/[%_]/g, "").trim();
      if (search.length) {
        query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,location_name.ilike.%${search}%`);
      }
    }

    if (filters.groupId) {
      query = query.eq("group_id", filters.groupId);
    }

    const now = new Date();
    if (filters.timeframe === "today") {
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      const nextDay = new Date(dayStart);
      nextDay.setDate(nextDay.getDate() + 1);
      query = query.gte("start_at", dayStart.toISOString()).lt("start_at", nextDay.toISOString());
    } else if (filters.timeframe === "week") {
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() + 7);
      query = query.gte("start_at", now.toISOString()).lt("start_at", weekEnd.toISOString());
    }

    const { data: eventRows, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
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

    return NextResponse.json({ events });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json(
      { error: "Configuration Error", details: "Missing required Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY" },
      { status: 500 }
    );
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
        lat: payload.lat,
        lng: payload.lng,
        status: payload.status,
        visibility: payload.visibility,
        group_id: payload.group_id ?? null
      })
      .select("*")
      .single();

    if (error || !inserted) {
      return NextResponse.json({ error: error?.message ?? "Failed to create event" }, { status: 400 });
    }

    const events = await enrichEventsWithMeta({
      supabase: auth.supabase,
      events: [inserted],
      userId: auth.user.id,
      isMod: false
    });

    return NextResponse.json({ event: events[0] }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
