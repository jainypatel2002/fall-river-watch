"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

type LocationPickerMapProps = {
  selectedLocation: { lat: number; lng: number } | null;
  onLocationChange: (value: { lat: number; lng: number }) => void;
  onCenterChange?: (value: { lat: number; lng: number }) => void;
};

const FALLBACK_CENTER = { lat: 41.7001, lng: -71.155 };
const CAMERA_SYNC_EPSILON = 0.0002;

function shouldReduceMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function hasMeaningfulDelta(current: { lat: number; lng: number }, next: { lat: number; lng: number }) {
  return Math.abs(current.lat - next.lat) > CAMERA_SYNC_EPSILON || Math.abs(current.lng - next.lng) > CAMERA_SYNC_EPSILON;
}

export default function LocationPickerMap({ selectedLocation, onLocationChange, onCenterChange }: LocationPickerMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const onLocationChangeRef = useRef(onLocationChange);
  const onCenterChangeRef = useRef(onCenterChange);
  const initialCenterRef = useRef(selectedLocation ?? FALLBACK_CENTER);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const selectedLat = selectedLocation?.lat;
  const selectedLng = selectedLocation?.lng;

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  useEffect(() => {
    onCenterChangeRef.current = onCenterChange;
  }, [onCenterChange]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !token) return;

    mapboxgl.accessToken = token;

    const initialCenter = initialCenterRef.current;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [initialCenter.lng, initialCenter.lat],
      zoom: 14
    });

    const marker = new mapboxgl.Marker({ draggable: true, color: "#22d3ee" })
      .setLngLat([initialCenter.lng, initialCenter.lat])
      .addTo(map);

    marker.on("dragend", () => {
      const coords = marker.getLngLat();
      onLocationChangeRef.current({ lat: coords.lat, lng: coords.lng });
    });

    map.on("click", (event) => {
      const next = { lat: event.lngLat.lat, lng: event.lngLat.lng };
      marker.setLngLat([next.lng, next.lat]);
      onLocationChangeRef.current(next);
    });

    map.on("moveend", () => {
      const center = map.getCenter();
      onCenterChangeRef.current?.({ lat: center.lat, lng: center.lng });
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || !selectedLocation) return;

    marker.setLngLat([selectedLocation.lng, selectedLocation.lat]);

    const mapCenter = map.getCenter();
    const currentCenter = { lat: mapCenter.lat, lng: mapCenter.lng };
    if (!hasMeaningfulDelta(currentCenter, selectedLocation)) return;

    map.flyTo({
      center: [selectedLocation.lng, selectedLocation.lat],
      zoom: Math.max(14, map.getZoom()),
      duration: shouldReduceMotion() ? 0 : 620,
      essential: true
    });
  }, [selectedLat, selectedLng, selectedLocation]);

  if (!token) {
    return (
      <div className="grid h-72 place-items-center rounded-2xl border border-[var(--border)] bg-[rgba(11,16,29,0.8)] text-sm text-[color:var(--muted)]">
        Missing `NEXT_PUBLIC_MAPBOX_TOKEN`.
      </div>
    );
  }

  return <div ref={containerRef} className="h-72 w-full overflow-hidden rounded-2xl border border-[var(--border)]" />;
}
