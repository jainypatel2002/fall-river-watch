"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo } from "react";
import { AlertCircle, ShieldAlert } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { ReportFeed } from "@/components/features/report-feed";
import { FiltersSheet } from "@/components/features/filters-sheet";
import { ReportFab } from "@/components/features/report-fab";
import { StatusBadge } from "@/components/features/status-badge";
import { useGeolocation } from "@/hooks/use-geolocation";
import { useReportsRealtime } from "@/hooks/use-reports-realtime";
import { useReportsQuery } from "@/lib/queries/reports";
import { useUiStore } from "@/lib/store/ui-store";
import { formatDistance, prettyCategory } from "@/lib/utils/format";

const IncidentMap = dynamic(() => import("@/components/map/incident-map"), {
  ssr: false,
  loading: () => <div className="h-[65vh] animate-pulse rounded-xl bg-zinc-200" />
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
    setMapCenter,
    userLocation,
    geolocationDenied
  } = useUiStore();

  const filters = useMemo(
    () => ({
      centerLat: mapCenter.lat,
      centerLng: mapCenter.lng,
      categories,
      timeWindow,
      radiusMiles,
      verifiedOnly
    }),
    [categories, mapCenter.lat, mapCenter.lng, radiusMiles, timeWindow, verifiedOnly]
  );

  const reportsQuery = useReportsQuery(filters);
  const reports = reportsQuery.data?.reports ?? [];
  const selectedReport = reports.find((report) => report.id === selectedReportId) ?? null;
  const showFallbackNotice = process.env.NODE_ENV === "development" && Boolean(reportsQuery.data?.fallbackUsed);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-heading)" }}>
            Neighborhood Incident Map
          </h1>
          <p className="text-sm text-zinc-600">Community reports with public verification.</p>
        </div>
        <div className="flex items-center gap-2">
          <FiltersSheet />
          <Link href="/auth" className="text-sm text-zinc-700 underline underline-offset-4">
            Account
          </Link>
        </div>
      </div>

      {geolocationDenied ? (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 h-4 w-4" />
          <p>Location access was denied. You can still browse reports by moving the map manually.</p>
        </div>
      ) : null}

      {reportsQuery.error ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4" />
          {(reportsQuery.error as Error).message}
        </div>
      ) : null}

      {showFallbackNotice ? (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Database function missing, using fallback query
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
            onCenterChange={setMapCenter}
          />

          {selectedReport ? (
            <Link href={`/report/${selectedReport.id}`}>
              <Card className="border-emerald-200 bg-emerald-50/50">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-zinc-900">{selectedReport.title || "Incident report"}</p>
                    <StatusBadge status={selectedReport.status} />
                  </div>
                  <p className="text-sm text-zinc-700">{selectedReport.description}</p>
                  <div className="flex items-center justify-between text-xs text-zinc-600">
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
    </main>
  );
}
