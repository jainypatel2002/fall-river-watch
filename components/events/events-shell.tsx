"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { EventFiltersBar } from "@/components/events/event-filters-bar";
import { EventListCard } from "@/components/events/event-list-card";
import { EventsMap } from "@/components/map/events-map";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useEventsQuery } from "@/lib/queries/events";

export function EventsShell() {
  const router = useRouter();
  const isMobile = useMediaQuery("(max-width: 767px)");

  const [timeframe, setTimeframe] = useState<"today" | "week" | "all">("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");

  const filters = useMemo(
    () => ({
      range: timeframe,
      category: category === "all" ? undefined : category,
      q: search.trim() || undefined
    }),
    [category, search, timeframe]
  );

  const eventsQuery = useEventsQuery(filters);
  const events = eventsQuery.data?.events ?? [];

  return (
    <section className="mx-auto w-full max-w-7xl space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontFamily: "var(--font-heading)" }}>
            Events
          </h1>
          <p className="text-sm text-[color:var(--muted)]">Community gatherings, safety meetings, and local updates.</p>
        </div>
        <Button className="min-h-11" onClick={() => router.push("/events/new")}>Create event</Button>
      </div>

      <div className="sticky top-[calc(env(safe-area-inset-top)+3.7rem)] z-30">
        <EventFiltersBar
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
          category={category}
          onCategoryChange={setCategory}
          search={search}
          onSearchChange={setSearch}
        />
      </div>

      {isMobile ? (
        <div className="inline-flex rounded-xl border border-[var(--border)] bg-[rgba(9,14,27,0.86)] p-1">
          <Button variant={mobileView === "list" ? "default" : "ghost"} className="h-9" onClick={() => setMobileView("list")}>
            List
          </Button>
          <Button variant={mobileView === "map" ? "default" : "ghost"} className="h-9" onClick={() => setMobileView("map")}>
            Map
          </Button>
        </div>
      ) : null}

      {eventsQuery.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-[1fr,1.2fr]">
          <div className="space-y-3">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
          <Skeleton className="h-[54vh] min-h-[22rem]" />
        </div>
      ) : null}

      {eventsQuery.isError ? (
        <div className="rounded-2xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">
          <p>{(eventsQuery.error as Error).message}</p>
          {process.env.NODE_ENV !== "production" ? (
            <pre className="mt-2 overflow-x-auto rounded-lg border border-rose-300/20 bg-[rgba(0,0,0,0.2)] p-2 text-[11px] text-rose-100/80">
              {JSON.stringify(
                {
                  status: (eventsQuery.error as Error & { status?: number }).status,
                  payload: (eventsQuery.error as Error & { payload?: unknown }).payload
                },
                null,
                2
              )}
            </pre>
          ) : null}
        </div>
      ) : null}

      {!eventsQuery.isLoading && !eventsQuery.isError && !events.length ? (
        <p className="rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.76)] p-4 text-sm text-[color:var(--muted)]">No events yet.</p>
      ) : null}

      {!eventsQuery.isLoading && events.length ? (
        <div className="grid gap-4 lg:grid-cols-[1fr,1.2fr]">
          {(!isMobile || mobileView === "list") ? (
            <div className="space-y-3">
              {events.map((event) => (
                <EventListCard
                  key={event.id}
                  event={event}
                  selected={selectedEventId === event.id}
                  onOpen={() => {
                    setSelectedEventId(event.id);
                    router.push(`/events/${event.id}`);
                  }}
                />
              ))}
            </div>
          ) : null}

          {(!isMobile || mobileView === "map") ? (
            <EventsMap
              events={events}
              selectedEventId={selectedEventId}
              onSelectEvent={setSelectedEventId}
              onOpenEvent={(eventId) => {
                router.push(`/events/${eventId}`);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
