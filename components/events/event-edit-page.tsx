"use client";

import Link from "next/link";
import { EventForm } from "@/components/events/event-form";
import { Skeleton } from "@/components/ui/skeleton";
import { useEventDetailQuery } from "@/lib/queries/events";

export function EventEditPage({ eventId }: { eventId: string }) {
  const detailQuery = useEventDetailQuery(eventId);

  if (detailQuery.isLoading) {
    return <Skeleton className="h-64" />;
  }

  if (detailQuery.isError || !detailQuery.data?.event) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">
          {(detailQuery.error as Error)?.message ?? "Event not found"}
        </p>
        <Link href="/events" className="text-sm text-[color:var(--muted)] underline underline-offset-4">
          Back to events
        </Link>
      </div>
    );
  }

  return <EventForm mode="edit" eventId={eventId} initialEvent={detailQuery.data.event} />;
}
