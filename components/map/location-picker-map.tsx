"use client";

import { useEffect, useMemo, useRef } from "react";
import mapboxgl, { type GeoJSONSource } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

type LocationPickerMapProps = {
  selectedLocation: { lat: number; lng: number } | null;
  dangerRadiusMeters?: number | null;
  onLocationChange: (value: { lat: number; lng: number }) => void;
  onCenterChange?: (value: { lat: number; lng: number }) => void;
};

const FALLBACK_CENTER = { lat: 41.7001, lng: -71.155 };
const CAMERA_SYNC_EPSILON = 0.0002;
const DANGER_SOURCE_ID = "danger-preview-source";
const DANGER_FILL_LAYER_ID = "danger-preview-fill";
const DANGER_LINE_LAYER_ID = "danger-preview-line";

function shouldReduceMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function normalizeLongitude(value: number) {
  const normalized = ((((value + 180) % 360) + 360) % 360) - 180;
  return normalized === -180 ? 180 : normalized;
}

function hasMeaningfulDelta(current: { lat: number; lng: number }, next: { lat: number; lng: number }) {
  return Math.abs(current.lat - next.lat) > CAMERA_SYNC_EPSILON || Math.abs(current.lng - next.lng) > CAMERA_SYNC_EPSILON;
}

function destinationPoint({ lat, lng, bearingDeg, distanceMeters }: { lat: number; lng: number; bearingDeg: number; distanceMeters: number }) {
  const earthRadius = 6_371_000;
  const angularDistance = distanceMeters / earthRadius;
  const bearing = (bearingDeg * Math.PI) / 180;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;

  const nextLat = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) + Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing)
  );

  const nextLng =
    lngRad +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(nextLat)
    );

  return {
    lat: (nextLat * 180) / Math.PI,
    lng: normalizeLongitude((nextLng * 180) / Math.PI)
  };
}

function buildDangerPreviewGeoJson(location: { lat: number; lng: number } | null, radiusMeters: number | null | undefined) {
  if (!location || !radiusMeters || radiusMeters < 50) {
    return {
      type: "FeatureCollection" as const,
      features: [] as GeoJSON.Feature<GeoJSON.Polygon>[]
    };
  }

  const steps = 40;
  const ring: [number, number][] = [];

  for (let index = 0; index <= steps; index += 1) {
    const bearingDeg = (index / steps) * 360;
    const next = destinationPoint({
      lat: location.lat,
      lng: location.lng,
      bearingDeg,
      distanceMeters: radiusMeters
    });
    ring.push([next.lng, next.lat]);
  }

  return {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        geometry: {
          type: "Polygon" as const,
          coordinates: [ring]
        },
        properties: {
          radius_meters: radiusMeters
        }
      }
    ]
  };
}

export default function LocationPickerMap({ selectedLocation, dangerRadiusMeters, onLocationChange, onCenterChange }: LocationPickerMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const dangerGeoJsonRef = useRef(buildDangerPreviewGeoJson(selectedLocation ?? FALLBACK_CENTER, dangerRadiusMeters));
  const onLocationChangeRef = useRef(onLocationChange);
  const onCenterChangeRef = useRef(onCenterChange);
  const initialCenterRef = useRef(selectedLocation ?? FALLBACK_CENTER);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const selectedLat = selectedLocation?.lat;
  const selectedLng = selectedLocation?.lng;

  const dangerGeoJson = useMemo(() => buildDangerPreviewGeoJson(selectedLocation, dangerRadiusMeters), [dangerRadiusMeters, selectedLocation]);

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
  }, [onLocationChange]);

  useEffect(() => {
    onCenterChangeRef.current = onCenterChange;
  }, [onCenterChange]);

  useEffect(() => {
    dangerGeoJsonRef.current = dangerGeoJson;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    const source = map.getSource(DANGER_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(dangerGeoJson);
  }, [dangerGeoJson]);

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

    map.on("load", () => {
      map.addSource(DANGER_SOURCE_ID, {
        type: "geojson",
        data: dangerGeoJsonRef.current
      });

      map.addLayer({
        id: DANGER_FILL_LAYER_ID,
        type: "fill",
        source: DANGER_SOURCE_ID,
        paint: {
          "fill-color": "rgba(248,113,113,0.25)",
          "fill-opacity": 0.25
        }
      });

      map.addLayer({
        id: DANGER_LINE_LAYER_ID,
        type: "line",
        source: DANGER_SOURCE_ID,
        paint: {
          "line-color": "rgba(248,113,113,0.8)",
          "line-width": 1.5
        }
      });
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
