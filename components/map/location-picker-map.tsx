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
      style: "mapbox://styles/mapbox/streets-v12",
      center: [value.lng, value.lat],
      zoom: 14
    });

    const marker = new mapboxgl.Marker({ draggable: true, color: "#0f766e" }).setLngLat([value.lng, value.lat]).addTo(map);

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
    map.easeTo({ center: [value.lng, value.lat], duration: 250 });
  }, [value.lat, value.lng]);

  if (!token) {
    return <div className="grid h-72 place-items-center rounded-lg border border-zinc-300 bg-zinc-100 text-sm">Missing `NEXT_PUBLIC_MAPBOX_TOKEN`.</div>;
  }

  return <div ref={containerRef} className="h-72 w-full overflow-hidden rounded-lg border border-zinc-200" />;
}
