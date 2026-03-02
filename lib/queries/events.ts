"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEvent,
  deleteEvent,
  getEvent,
  listEvents,
  updateEvent,
  updateEventRsvp,
  type ListEventsFilters
} from "@/lib/api/events";
import { queryKeys } from "@/lib/queries/keys";
import type { CreateEventInput, UpdateEventInput } from "@/lib/schemas/events";
import type { EventRsvpStatus } from "@/lib/types/events";

function serializeFilters(filters: ListEventsFilters) {
  return JSON.stringify({
    range: filters.range ?? "all",
    category: filters.category ?? null,
    q: filters.q ?? null
  });
}

export function useEventsQuery(filters: ListEventsFilters) {
  const key = serializeFilters(filters);
  return useQuery({
    queryKey: queryKeys.events(key),
    queryFn: ({ signal }) => listEvents(filters, signal),
    placeholderData: (previous) => previous
  });
}

export function useEventDetailQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.eventDetail(id),
    queryFn: () => getEvent(id),
    enabled: Boolean(id)
  });
}

export function useCreateEventMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateEventInput) => createEvent(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    }
  });
}

export function useUpdateEventMutation(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateEventInput) => updateEvent(eventId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.eventDetail(eventId) });
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    }
  });
}

export function useDeleteEventMutation(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => deleteEvent(eventId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.eventDetail(eventId) });
    }
  });
}

export function useEventRsvpMutation(eventId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (status: EventRsvpStatus | null) => updateEventRsvp(eventId, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.eventDetail(eventId) });
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    }
  });
}
