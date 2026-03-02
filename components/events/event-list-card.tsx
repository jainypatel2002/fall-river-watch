"use client";

import { CalendarClock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EventWithMeta } from "@/lib/types/events";

function formatDate(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function EventListCard({
  event,
  selected,
  onOpen
}: {
  event: EventWithMeta;
  selected?: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group w-full rounded-2xl border p-4 text-left transition-all duration-300",
        selected
          ? "border-[rgba(34,211,238,0.55)] bg-[rgba(22,33,58,0.9)] shadow-[0_12px_28px_rgba(6,10,22,0.45)]"
          : "border-[var(--border)] bg-[rgba(10,15,28,0.78)] hover:-translate-y-0.5 hover:border-[rgba(125,145,197,0.65)]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-cyan-300/90">{event.category}</p>
          <h3 className="text-base font-semibold text-[var(--fg)]">{event.title}</h3>
        </div>
        <span className="shrink-0 rounded-full border border-[rgba(148,163,184,0.32)] px-2 py-0.5 text-[11px] text-[color:var(--muted)]">
          {event.status}
        </span>
      </div>

      <p className="mt-2 line-clamp-2 text-sm text-[color:var(--muted)]">{event.description}</p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[color:var(--muted)]">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" />
          {formatDate(event.start_at)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5" />
          {event.location_name}
        </span>
      </div>
    </button>
  );
}
