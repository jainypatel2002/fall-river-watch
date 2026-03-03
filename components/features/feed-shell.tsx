"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { LocationSearch } from "@/components/map/LocationSearch";
import { ReportFeed } from "@/components/features/report-feed";
import { useReportsRealtime } from "@/hooks/use-reports-realtime";
import { useIncidentsMapQuery } from "@/lib/queries/incidents";
import { useMapSearchStore } from "@/lib/store/map-search-store";
import { useUiStore } from "@/lib/store/ui-store";

const FiltersSheet = dynamic(() => import("@/components/features/filters-sheet").then((module) => module.FiltersSheet), {
  ssr: false,
  loading: () => <div className="h-11 w-24 rounded-xl border border-[var(--border)] bg-[rgba(11,16,29,0.72)]" />
});

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const term = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  const arc = 2 * Math.atan2(Math.sqrt(term), Math.sqrt(1 - term));
  return earthRadiusMeters * arc;
}

function clampLatitude(value: number) {
  return Math.max(-90, Math.min(90, value));
}

function normalizeLongitude(value: number) {
  let normalized = value;
  while (normalized < -180) normalized += 360;
  while (normalized > 180) normalized -= 360;
  return normalized;
}

function radiusToBbox(center: { lat: number; lng: number }, radiusMiles: number) {
  const latDelta = radiusMiles / 69;
  const lngMilesPerDegree = Math.max(Math.cos(toRadians(center.lat)) * 69.172, 0.01);
  const lngDelta = radiusMiles / lngMilesPerDegree;

  return {
    west: normalizeLongitude(center.lng - lngDelta),
    south: clampLatitude(center.lat - latDelta),
    east: normalizeLongitude(center.lng + lngDelta),
    north: clampLatitude(center.lat + latDelta)
  };
}

export function FeedShell() {
  useReportsRealtime(true);

  const { categories, timeWindow, radiusMiles, verifiedOnly, mapCenter, setMapCenter, setSelectedReportId } = useUiStore();
  const searchQuery = useMapSearchStore((state) => state.searchQuery);
  const setSearchQuery = useMapSearchStore((state) => state.setSearchQuery);
  const setSelectedLocation = useMapSearchStore((state) => state.setSelectedLocation);
  const clearSelectedLocation = useMapSearchStore((state) => state.clearSelectedLocation);

  const mapFilters = useMemo(
    () => ({
      bbox: radiusToBbox(mapCenter, radiusMiles),
      categories,
      timeRange: timeWindow
    }),
    [categories, mapCenter, radiusMiles, timeWindow]
  );

  const incidentsQuery = useIncidentsMapQuery(mapFilters);

  const reports = useMemo(
    () =>
      (incidentsQuery.data?.items ?? [])
        .filter((item) => !verifiedOnly || item.status === "verified")
        .filter((item) => haversineMeters(mapCenter, { lat: item.lat, lng: item.lng }) <= radiusMiles * 1609.344)
        .map((item) => ({
          ...item,
          distance_meters: haversineMeters(mapCenter, { lat: item.lat, lng: item.lng }),
          status: item.status as "unverified" | "verified" | "disputed" | "resolved" | "expired"
        })),
    [incidentsQuery.data?.items, mapCenter, radiusMiles, verifiedOnly]
  );

  const onSelectLocation = useCallback(
    (location: { id: string; label: string; lat: number; lng: number }) => {
      setSelectedReportId(null);
      setSelectedLocation({
        id: location.id,
        label: location.label,
        lat: location.lat,
        lng: location.lng
      });
      setMapCenter({ lat: location.lat, lng: location.lng });
    },
    [setMapCenter, setSelectedLocation, setSelectedReportId]
  );

  return (
    <section className="mx-auto w-full max-w-5xl space-y-4 pb-20 sm:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontFamily: "var(--font-heading)" }}>
            Incident Feed
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">Recent community incident reports in card view.</p>
        </div>
        <FiltersSheet />
      </div>

      <LocationSearch
        value={searchQuery}
        onChange={setSearchQuery}
        onSelectLocation={onSelectLocation}
        onClearSearch={clearSelectedLocation}
        getProximity={() => mapCenter}
        title="Feed Location"
        showHint={false}
      />

      {incidentsQuery.error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">
          <AlertCircle className="h-4 w-4" />
          {(incidentsQuery.error as Error).message}
        </div>
      ) : null}

      <ReportFeed reports={reports} isLoading={incidentsQuery.isLoading} error={incidentsQuery.error ? (incidentsQuery.error as Error).message : undefined} />
    </section>
  );
}
