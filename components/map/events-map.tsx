"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ArrowRight, MapPin, X } from "lucide-react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import { EventCardMarker } from "@/components/events/event-card-marker";
import type { EventWithMeta } from "@/lib/types/events";

type MarkerRef = {
  marker: mapboxgl.Marker;
  root: Root;
};

function markerBounds(events: EventWithMeta[]) {
  if (events.length < 2) return null;
  const bounds = new mapboxgl.LngLatBounds();
  for (const event of events) {
    bounds.extend([event.lng, event.lat]);
  }
  return bounds;
}

function shortDate(value: string) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

export function EventsMap({
  events,
  selectedEventId,
  onSelectEvent,
  onOpenEvent
}: {
  events: EventWithMeta[];
  selectedEventId: string | null;
  onSelectEvent: (id: string) => void;
  onOpenEvent: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRefs = useRef<MarkerRef[]>([]);
  const hasFitBoundsRef = useRef(false);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const isMobile = useMediaQuery("(max-width: 767px)");

  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [expandedClickCount, setExpandedClickCount] = useState(0);

  const expandedEvent = useMemo(
    () => events.find((event) => event.id === expandedEventId) ?? null,
    [events, expandedEventId]
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !token) return;

    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [-71.155, 41.7001],
      zoom: 11.4,
      attributionControl: false
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    map.on("click", () => {
      setExpandedEventId(null);
      setExpandedClickCount(0);
    });

    mapRef.current = map;

    return () => {
      markerRefs.current.forEach((entry) => {
        entry.root.unmount();
        entry.marker.remove();
      });
      markerRefs.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markerRefs.current.forEach((entry) => {
      entry.root.unmount();
      entry.marker.remove();
    });
    markerRefs.current = [];

    const handleMarkerPress = (event: EventWithMeta) => {
      if (expandedEventId === event.id && expandedClickCount >= 1) {
        onOpenEvent(event.id);
        return;
      }

      setExpandedEventId(event.id);
      setExpandedClickCount(1);
      onSelectEvent(event.id);

      map.flyTo({
        center: [event.lng, event.lat],
        zoom: Math.max(13, map.getZoom()),
        duration: 520
      });
    };

    for (const event of events) {
      const element = document.createElement("div");
      const root = createRoot(element);

      root.render(
        <EventCardMarker
          event={event}
          expanded={!isMobile && event.id === expandedEventId}
          onPress={() => handleMarkerPress(event)}
        />
      );

      const marker = new mapboxgl.Marker({
        element,
        anchor: "bottom"
      })
        .setLngLat([event.lng, event.lat])
        .addTo(map);

      markerRefs.current.push({ marker, root });
    }
  }, [events, expandedClickCount, expandedEventId, isMobile, onOpenEvent, onSelectEvent]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !events.length) return;

    if (selectedEventId) {
      const selected = events.find((event) => event.id === selectedEventId);
      if (!selected) return;

      map.flyTo({
        center: [selected.lng, selected.lat],
        zoom: Math.max(13, map.getZoom()),
        duration: 420
      });
      return;
    }

    if (!hasFitBoundsRef.current) {
      const bounds = markerBounds(events);
      if (bounds) {
        map.fitBounds(bounds, {
          padding: 70,
          maxZoom: 13,
          duration: 640
        });
      }
      hasFitBoundsRef.current = true;
    }
  }, [events, selectedEventId]);

  if (!token) {
    return (
      <div className="rounded-2xl border border-rose-400/40 bg-rose-400/10 p-4 text-sm text-rose-100">
        Missing map token. Set <code>NEXT_PUBLIC_MAPBOX_TOKEN</code> to render events.
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={containerRef} className="h-[54vh] min-h-[22rem] w-full overflow-hidden rounded-2xl border border-[var(--border)]" />

      {isMobile && expandedEvent ? (
        <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20">
          <div className="pointer-events-auto rounded-2xl border border-[rgba(34,211,238,0.48)] bg-[rgba(8,13,24,0.96)] p-3 shadow-[0_14px_36px_rgba(0,0,0,0.5)] transition-all">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-cyan-300">{expandedEvent.category}</p>
                <p className="text-sm font-semibold text-[var(--fg)]">{expandedEvent.title}</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-[var(--border)] p-1 text-[color:var(--muted)]"
                onClick={() => {
                  setExpandedEventId(null);
                  setExpandedClickCount(0);
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="mt-2 line-clamp-2 text-xs text-[color:var(--muted)]">{expandedEvent.description}</p>

            <div className="mt-3 flex items-center justify-between text-xs text-[color:var(--muted)]">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {expandedEvent.location_name}
              </span>
              <span>{shortDate(expandedEvent.start_at)}</span>
            </div>

            <Button
              type="button"
              className="mt-3 h-10 w-full"
              onClick={() => {
                if (expandedClickCount >= 1) {
                  onOpenEvent(expandedEvent.id);
                  return;
                }
                setExpandedClickCount(1);
              }}
            >
              Tap again to view
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
