import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventWithMeta } from "@/lib/types/events";

type EventRow = {
  id: string;
  creator_user_id: string;
  title: string;
  description: string;
  category: string;
  start_at: string;
  end_at: string | null;
  location_name: string;
  address: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  place_id: string | null;
  formatted_address: string | null;
  lat: string | number;
  lng: string | number;
  status: string;
  created_at: string;
  updated_at: string;
};

function toNumber(value: string | number) {
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function enrichEventsWithMeta({
  supabase,
  events,
  userId,
  isMod
}: {
  supabase: Pick<SupabaseClient, "rpc" | "from">;
  events: EventRow[];
  userId: string | null;
  isMod: boolean;
}): Promise<EventWithMeta[]> {
  if (!events.length) return [];

  const eventIds = events.map((event) => event.id);

  const [{ data: summaryRows }, { data: userRows }] = await Promise.all([
    supabase.rpc("get_event_rsvp_summary", {
      p_event_ids: eventIds
    }),
    userId
      ? supabase.from("event_rsvps").select("event_id, status").eq("user_id", userId).in("event_id", eventIds)
      : Promise.resolve({ data: [] as Array<{ event_id: string; status: "going" | "interested" }> })
  ]);

  const summaryById = new Map<
    string,
    {
      going_count: number;
      interested_count: number;
    }
  >();

  for (const row of summaryRows ?? []) {
    summaryById.set(row.event_id, {
      going_count: Number(row.going_count ?? 0),
      interested_count: Number(row.interested_count ?? 0)
    });
  }

  const userRsvpById = new Map<string, "going" | "interested">();
  for (const row of userRows ?? []) {
    if (row.status === "going" || row.status === "interested") {
      userRsvpById.set(row.event_id, row.status);
    }
  }

  return events.map((event) => {
    const summary = summaryById.get(event.id);

    return {
      ...event,
      lat: toNumber(event.lat),
      lng: toNumber(event.lng),
      category: event.category as EventWithMeta["category"],
      status: event.status as EventWithMeta["status"],
      going_count: summary?.going_count ?? 0,
      interested_count: summary?.interested_count ?? 0,
      user_rsvp: userRsvpById.get(event.id) ?? null,
      can_manage: Boolean(userId && (event.creator_user_id === userId || isMod))
    };
  });
}
