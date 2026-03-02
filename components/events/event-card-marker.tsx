"use client";

import { cn } from "@/lib/utils";
import type { EventWithMeta } from "@/lib/types/events";

function formatTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function EventCardMarker({
  event,
  expanded,
  onPress
}: {
  event: EventWithMeta;
  expanded: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={cn(
        "group w-[10.5rem] rounded-xl border border-[rgba(135,169,219,0.38)] bg-[rgba(10,16,30,0.93)] p-2 text-left shadow-[0_10px_22px_rgba(0,0,0,0.42)] transition-all duration-300 ease-out",
        expanded ? "w-[14.5rem] border-[rgba(34,211,238,0.58)]" : "hover:-translate-y-0.5"
      )}
      aria-label={`Event ${event.title}`}
    >
      <p className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-cyan-300/90">{event.category}</p>
      <p className="line-clamp-1 text-sm font-semibold text-[var(--fg)]">{event.title}</p>
      <p className="text-[11px] text-[color:var(--muted)]">{formatTime(event.start_at)}</p>

      <div
        className={cn(
          "grid transition-all duration-300",
          expanded ? "mt-2 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <p className="line-clamp-2 text-xs text-[color:var(--muted)]">{event.description}</p>
          <p className="mt-1 line-clamp-1 text-xs text-slate-200/90">{event.location_name}</p>
          <p className="mt-1 text-[11px] font-medium text-cyan-300">Tap again to view</p>
        </div>
      </div>
    </button>
  );
}
