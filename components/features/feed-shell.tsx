"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { LocationSearch } from "@/components/map/LocationSearch";
import { ReportFeed } from "@/components/features/report-feed";
import { useReportsRealtime } from "@/hooks/use-reports-realtime";
import { useRecentReportsQuery } from "@/lib/queries/incidents";
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

const DEFAULT_FEED_CENTER = { lat: 41.7001, lng: -71.155 };

export function FeedShell() {
  useReportsRealtime(true);
  const [feedCenter, setFeedCenter] = useState(DEFAULT_FEED_CENTER);
  const pathname = usePathname();

  const { categories, timeWindow, radiusMiles, verifiedOnly, setSelectedReportId } = useUiStore();
  const searchQuery = useMapSearchStore((state) => state.searchQuery);
  const setSearchQuery = useMapSearchStore((state) => state.setSearchQuery);
  const setSelectedLocation = useMapSearchStore((state) => state.setSelectedLocation);
  const clearSelectedLocation = useMapSearchStore((state) => state.clearSelectedLocation);

  const recentReportFilters = useMemo(
    () => ({
      center: feedCenter,
      radiusMiles,
      categories,
      timeRange: timeWindow
    }),
    [categories, feedCenter, radiusMiles, timeWindow]
  );

  // Feed used to share "incidents-map" query cache with the landing map viewport.
  // That made Feed appear empty after navigation when the cached viewport result was stale.
  // A dedicated "recent-reports" query key with mount refetch keeps Feed loading reliably.
  const incidentsQuery = useRecentReportsQuery(recentReportFilters);

  const reports = useMemo(
    () =>
      (incidentsQuery.data?.items ?? [])
        .filter((item) => !verifiedOnly || item.status === "verified")
        .filter((item) => haversineMeters(feedCenter, { lat: item.lat, lng: item.lng }) <= radiusMiles * 1609.344)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map((item) => ({
          ...item,
          distance_meters: haversineMeters(feedCenter, { lat: item.lat, lng: item.lng }),
          status: item.status as "unverified" | "verified" | "disputed" | "resolved" | "expired"
        })),
    [feedCenter, incidentsQuery.data?.items, radiusMiles, verifiedOnly]
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
      setFeedCenter({ lat: location.lat, lng: location.lng });
    },
    [setSelectedLocation, setSelectedReportId]
  );

  const handleClearSearch = useCallback(() => {
    clearSelectedLocation();
    setFeedCenter(DEFAULT_FEED_CENTER);
  }, [clearSelectedLocation]);

  const showFeedLocationSearch = pathname === "/feed";

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

      {showFeedLocationSearch ? (
        <div data-feed-location-overlay="true">
          <LocationSearch
            value={searchQuery}
            onChange={setSearchQuery}
            onSelectLocation={onSelectLocation}
            onClearSearch={handleClearSearch}
            getProximity={() => feedCenter}
            title="Feed Location"
            showHint={false}
          />
        </div>
      ) : null}

      {incidentsQuery.error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">
          <AlertCircle className="h-4 w-4" />
          {(incidentsQuery.error as Error).message}
        </div>
      ) : null}

      <ReportFeed
        reports={reports}
        isLoading={incidentsQuery.isPending || incidentsQuery.isFetching}
        error={incidentsQuery.error ? (incidentsQuery.error as Error).message : undefined}
      />
    </section>
  );
}
