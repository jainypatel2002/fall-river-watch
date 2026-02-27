"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

type LocationPickerMapProps = {
  value: { lat: number; lng: number };
  onChange: (value: { lat: number; lng: number }) => void;
};

export default function LocationPickerMap({ value, onChange }: LocationPickerMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !token) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [value.lng, value.lat],
      zoom: 14
    });

    const marker = new mapboxgl.Marker({ draggable: true, color: "#22d3ee" }).setLngLat([value.lng, value.lat]).addTo(map);

    marker.on("dragend", () => {
      const coords = marker.getLngLat();
      onChange({ lat: coords.lat, lng: coords.lng });
    });

    map.on("click", (event) => {
      const coords = event.lngLat;
      marker.setLngLat(coords);
      onChange({ lat: coords.lat, lng: coords.lng });
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [onChange, token, value.lat, value.lng]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;

    marker.setLngLat([value.lng, value.lat]);
    map.easeTo({ center: [value.lng, value.lat], duration: 180 });
  }, [value.lat, value.lng]);

  if (!token) {
    return (
      <div className="grid h-72 place-items-center rounded-2xl border border-[var(--border)] bg-[rgba(11,16,29,0.8)] text-sm text-[color:var(--muted)]">
        Missing `NEXT_PUBLIC_MAPBOX_TOKEN`.
      </div>
    );
  }

  return <div ref={containerRef} className="h-72 w-full overflow-hidden rounded-2xl border border-[var(--border)]" />;
}
