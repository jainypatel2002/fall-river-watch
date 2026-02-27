"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ShieldAlert } from "lucide-react";
import { CategoryLayerControl } from "@/components/map/category-layer-control";
import { LocationSearch } from "@/components/map/LocationSearch";
import { ReportFab } from "@/components/features/report-fab";
import { ReportFeed } from "@/components/features/report-feed";
import { StatusBadge } from "@/components/features/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useReportsRealtime } from "@/hooks/use-reports-realtime";
import { useUiToast } from "@/hooks/use-ui-toast";
import { useIncidentsMapQuery } from "@/lib/queries/incidents";
import { useMapSearchStore } from "@/lib/store/map-search-store";
import { useUiStore } from "@/lib/store/ui-store";
import { formatRelativeTime, prettyCategory } from "@/lib/utils/format";

const IncidentMap = dynamic(() => import("@/components/map/incident-map"), {
  ssr: false,
  loading: () => <div className="shimmer h-[62vh] rounded-2xl border border-[var(--border)] bg-[rgba(11,16,29,0.72)]" />
});

const FiltersSheet = dynamic(() => import("@/components/features/filters-sheet").then((module) => module.FiltersSheet), {
  ssr: false,
  loading: () => <div className="h-9 w-24 rounded-xl border border-[var(--border)] bg-[rgba(11,16,29,0.72)]" />
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

export function HomeShell() {
  const router = useRouter();
  const uiToast = useUiToast();
  useReportsRealtime(true);

  const {
    activeTab,
    setActiveTab,
    selectedReportId,
    setSelectedReportId,
    categories,
    timeWindow,
    radiusMiles,
    verifiedOnly,
    mapCenter,
    mapBounds,
    setMapCenter,
    setMapViewport,
    userLocation,
    setUserLocation,
    geolocationDenied,
    setGeolocationDenied
  } = useUiStore();
  const selectedSearchLocation = useMapSearchStore((state) => state.selectedLocation);
  const searchQuery = useMapSearchStore((state) => state.searchQuery);
  const setSearchQuery = useMapSearchStore((state) => state.setSearchQuery);
  const setSelectedLocation = useMapSearchStore((state) => state.setSelectedLocation);
  const clearSelectedLocation = useMapSearchStore((state) => state.clearSelectedLocation);

  const mapFilters = useMemo(
    () => ({
      bbox: mapBounds,
      categories,
      timeRange: timeWindow
    }),
    [categories, mapBounds, timeWindow]
  );

  const incidentsQuery = useIncidentsMapQuery(mapFilters);

  const reports = (incidentsQuery.data?.items ?? [])
    .filter((item) => !verifiedOnly || item.status === "verified")
    .filter((item) => haversineMeters(mapCenter, { lat: item.lat, lng: item.lng }) <= radiusMiles * 1609.344)
    .map((item) => ({
      ...item,
      distance_meters: haversineMeters(mapCenter, { lat: item.lat, lng: item.lng }),
      confirms: 0,
      disputes: 0
    }));

  const selectedReport = reports.find((report) => report.id === selectedReportId) ?? null;
  const hasMoreInViewport = Boolean(incidentsQuery.data?.nextCursor);

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
    <section className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontFamily: "var(--font-heading)" }}>
            Live Incident Intelligence
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">Community reports with verification signals and realtime updates.</p>
        </div>
        <FiltersSheet />
      </div>

      {geolocationDenied ? (
        <div className="flex items-start gap-2 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
          <ShieldAlert className="mt-0.5 h-4 w-4" />
          <p>Location access was denied. Use map controls manually or re-enable location permissions.</p>
        </div>
      ) : null}

      {incidentsQuery.error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">
          <AlertCircle className="h-4 w-4" />
          {(incidentsQuery.error as Error).message}
        </div>
      ) : null}

      {hasMoreInViewport ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">Zoom in to see more incidents in this area.</div>
      ) : null}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "map" | "feed")}>
        <TabsList>
          <TabsTrigger value="map">Map</TabsTrigger>
          <TabsTrigger value="feed">Feed</TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="space-y-3" forceMount>
          <div className="relative">
            <IncidentMap
              reports={reports}
              selectedReportId={selectedReportId}
              center={mapCenter}
              userLocation={userLocation}
              isActive={activeTab === "map"}
              searchTarget={selectedSearchLocation}
              onSelectReport={setSelectedReportId}
              onOpenReport={(id) => {
                setSelectedReportId(id);
                router.push(`/report/${id}`);
              }}
              onViewportChange={setMapViewport}
              onUserLocationFound={(coords) => {
                setUserLocation(coords);
                setMapCenter(coords);
                setGeolocationDenied(false);
              }}
              onLocateError={(message) => {
                setGeolocationDenied(true);
                uiToast.info("Location unavailable", message);
              }}
            />
            <CategoryLayerControl />
          </div>

          {incidentsQuery.isFetching ? <p className="text-xs text-[color:var(--muted)]">Refreshing map incidents...</p> : null}

          <LocationSearch
            value={searchQuery}
            onChange={setSearchQuery}
            onSelectLocation={onSelectLocation}
            onClearSearch={clearSelectedLocation}
            getProximity={() => mapCenter}
          />

          {selectedReport ? (
            <Link href={`/report/${selectedReport.id}`}>
              <Card>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--fg)]">{selectedReport.title || "Incident report"}</p>
                    <StatusBadge status={selectedReport.status as "unverified" | "verified" | "disputed" | "resolved" | "expired"} />
                  </div>
                  <p className="text-sm text-[color:var(--muted)]">{selectedReport.description}</p>
                  <div className="flex items-center justify-between text-xs text-[color:var(--muted)]">
                    <span>{prettyCategory(selectedReport.category)}</span>
                    <span>{formatRelativeTime(selectedReport.created_at)}</span>
                  </div>
                  <p className="text-xs text-[color:var(--muted)]">By {selectedReport.author_display_name}</p>
                </CardContent>
              </Card>
            </Link>
          ) : null}
        </TabsContent>

        <TabsContent value="feed">
          <ReportFeed
            reports={reports.map((report) => ({
              ...report,
              status: report.status as "unverified" | "verified" | "disputed" | "resolved" | "expired"
            }))}
            isLoading={incidentsQuery.isLoading}
            error={incidentsQuery.error ? (incidentsQuery.error as Error).message : undefined}
          />
        </TabsContent>
      </Tabs>

      <ReportFab />
    </section>
  );
}
