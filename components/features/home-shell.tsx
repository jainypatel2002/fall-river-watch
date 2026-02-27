"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo } from "react";
import { AlertCircle, ShieldAlert } from "lucide-react";
import { ReportFab } from "@/components/features/report-fab";
import { ReportFeed } from "@/components/features/report-feed";
import { StatusBadge } from "@/components/features/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useReportsRealtime } from "@/hooks/use-reports-realtime";
import { useReportsQuery } from "@/lib/queries/reports";
import { useUiStore } from "@/lib/store/ui-store";
import { formatDistance, prettyCategory } from "@/lib/utils/format";

const IncidentMap = dynamic(() => import("@/components/map/incident-map"), {
  ssr: false,
  loading: () => <div className="shimmer h-[62vh] rounded-2xl border border-[var(--border)] bg-[rgba(11,16,29,0.72)]" />
});

const FiltersSheet = dynamic(() => import("@/components/features/filters-sheet").then((module) => module.FiltersSheet), {
  ssr: false,
  loading: () => <div className="h-9 w-24 rounded-xl border border-[var(--border)] bg-[rgba(11,16,29,0.72)]" />
});

export function HomeShell() {
  useGeolocation();
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
    setMapViewport,
    userLocation,
    geolocationDenied
  } = useUiStore();

  const filters = useMemo(
    () => ({
      centerLat: mapCenter.lat,
      centerLng: mapCenter.lng,
      bounds: mapBounds ?? undefined,
      categories,
      timeWindow,
      radiusMiles,
      verifiedOnly
    }),
    [categories, mapBounds, mapCenter.lat, mapCenter.lng, radiusMiles, timeWindow, verifiedOnly]
  );

  const reportsQuery = useReportsQuery(filters);
  const reports = reportsQuery.data?.reports ?? [];
  const selectedReport = reports.find((report) => report.id === selectedReportId) ?? null;
  const showFallbackNotice = process.env.NODE_ENV === "development" && Boolean(reportsQuery.data?.fallbackUsed);

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
          <p>Location access was denied. Move the map manually to pick your search area.</p>
        </div>
      ) : null}

      {reportsQuery.error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">
          <AlertCircle className="h-4 w-4" />
          {(reportsQuery.error as Error).message}
        </div>
      ) : null}

      {showFallbackNotice ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">
          Database RPC unavailable. Running fallback query mode.
        </div>
      ) : null}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "map" | "feed")}>
        <TabsList>
          <TabsTrigger value="map">Map</TabsTrigger>
          <TabsTrigger value="feed">Feed</TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="space-y-3">
          <IncidentMap
            reports={reports}
            selectedReportId={selectedReportId}
            center={mapCenter}
            userLocation={userLocation}
            onSelectReport={setSelectedReportId}
            onViewportChange={setMapViewport}
          />

          {selectedReport ? (
            <Link href={`/report/${selectedReport.id}`}>
              <Card>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--fg)]">{selectedReport.title || "Incident report"}</p>
                    <StatusBadge status={selectedReport.status} />
                  </div>
                  <p className="text-sm text-[color:var(--muted)]">{selectedReport.description}</p>
                  <div className="flex items-center justify-between text-xs text-[color:var(--muted)]">
                    <span>{prettyCategory(selectedReport.category)}</span>
                    <span>{formatDistance(selectedReport.distance_meters)}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ) : null}
        </TabsContent>

        <TabsContent value="feed">
          <ReportFeed
            reports={reports}
            isLoading={reportsQuery.isLoading}
            error={reportsQuery.error ? (reportsQuery.error as Error).message : undefined}
          />
        </TabsContent>
      </Tabs>

      <ReportFab />
    </section>
  );
}
