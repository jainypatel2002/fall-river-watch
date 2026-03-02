import { jsonFetch } from "@/lib/queries/fetcher";
import type { EventRsvpStatus, EventWithMeta } from "@/lib/types/events";
import type { CreateEventInput, UpdateEventInput } from "@/lib/schemas/events";

export type ListEventsFilters = {
  range?: "today" | "week" | "all";
  category?: string;
  q?: string;
};

function buildQuery(params: ListEventsFilters) {
  const query = new URLSearchParams();
  if (params.range) query.set("range", params.range);
  if (params.category) query.set("category", params.category);
  if (params.q) query.set("q", params.q);
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export async function listEvents(filters: ListEventsFilters, signal?: AbortSignal) {
  try {
    const payload = await jsonFetch<{ ok: boolean; data: EventWithMeta[] }>(`/api/events${buildQuery(filters)}`, {
      method: "GET",
      cache: "no-store",
      signal
    });
    return { events: payload.data ?? [] };
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      const eventError = error as Error & { status?: number; payload?: unknown };
      console.error("Events fetch failed", {
        status: eventError.status,
        payload: eventError.payload
      });
    }
    throw error;
  }
}

export async function getEvent(id: string) {
  return jsonFetch<{ event: EventWithMeta }>(`/api/events/${id}`, {
    method: "GET",
    cache: "no-store"
  });
}

export async function createEvent(payload: CreateEventInput) {
  const result = await jsonFetch<{ ok: boolean; data: EventWithMeta }>("/api/events", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  return { event: result.data };
}

export async function updateEvent(id: string, payload: UpdateEventInput) {
  return jsonFetch<{ event: EventWithMeta }>(`/api/events/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function deleteEvent(id: string) {
  return jsonFetch<{ ok: true }>(`/api/events/${id}`, {
    method: "DELETE"
  });
}

export async function updateEventRsvp(id: string, status: EventRsvpStatus | null) {
  return jsonFetch<{ ok: true }>(`/api/events/${id}/rsvp`, {
    method: "POST",
    body: JSON.stringify({ status })
  });
}
