"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, CircleAlert, LoaderCircle, ShieldAlert } from "lucide-react";
import { CategoryLayerControl } from "@/components/map/category-layer-control";
import { LocationSearch } from "@/components/map/LocationSearch";
import { MobileMapControlsSheet } from "@/components/features/mobile-map-controls-sheet";
import { ReportFab } from "@/components/features/report-fab";
import { ReportFeed } from "@/components/features/report-feed";
import { StatusBadge } from "@/components/features/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useReportsRealtime } from "@/hooks/use-reports-realtime";
import { useWeatherTarget } from "@/hooks/use-weather-target";
import { useSupabaseBrowser } from "@/hooks/use-supabase-browser";
import { useUiToast } from "@/hooks/use-ui-toast";
import { useIncidentsMapQuery } from "@/lib/queries/incidents";
import { useWeatherQuery } from "@/lib/queries/weather";
import { useVoteMutation } from "@/lib/queries/reports";
import { useMapSearchStore } from "@/lib/store/map-search-store";
import { useUiStore } from "@/lib/store/ui-store";
import { formatRelativeTime, prettyCategory } from "@/lib/utils/format";

const IncidentMap = dynamic(() => import("@/components/map/incident-map"), {
  ssr: false,
  loading: () => <div className="shimmer h-[58vh] min-h-[20rem] rounded-2xl border border-[var(--border)] bg-[rgba(11,16,29,0.72)] sm:h-[62vh] sm:min-h-[22rem]" />
});

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

export function HomeShell() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMobile = useMediaQuery("(max-width: 640px)");
  const supabase = useSupabaseBrowser();
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
    showWeatherAlertsLayer,
    openWeatherPanel,
    setUserLocation,
    geolocationDenied,
    setGeolocationDenied,
    mobileMapOverlayMode,
    mobileMapSheetSnap
  } = useUiStore();
  const selectedSearchLocation = useMapSearchStore((state) => state.selectedLocation);
  const searchQuery = useMapSearchStore((state) => state.searchQuery);
  const setSearchQuery = useMapSearchStore((state) => state.setSearchQuery);
  const setSelectedLocation = useMapSearchStore((state) => state.setSelectedLocation);
  const clearSelectedLocation = useMapSearchStore((state) => state.clearSelectedLocation);
  const weatherTarget = useWeatherTarget();
  const weatherQuery = useWeatherQuery({
    target: weatherTarget.coordinates,
    source: weatherTarget.source,
    enabled: activeTab === "map"
  });

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
      distance_meters: haversineMeters(mapCenter, { lat: item.lat, lng: item.lng })
    }));

  const selectedReport = reports.find((report) => report.id === selectedReportId) ?? null;
  const selectedReportVoteMutation = useVoteMutation(selectedReport?.id ?? "");
  const hasMoreInViewport = Boolean(incidentsQuery.data?.nextCursor);

  const handleSelectedReportVote = useCallback(
    async (voteType: "confirm" | "dispute") => {
      if (!selectedReport) return;
      const nextStatus = selectedReport.user_vote === voteType ? null : voteType;

      try {
        await selectedReportVoteMutation.mutateAsync(nextStatus);
      } catch (error) {
        const status = (error as Error & { status?: number }).status;
        if (status === 401) {
          uiToast.info("Sign in required", "Please sign in to confirm or dispute reports.");
          return;
        }
        uiToast.error((error as Error).message);
      }
    },
    [selectedReport, selectedReportVoteMutation, uiToast]
  );

  useEffect(() => {
    const reportIdParam = searchParams?.get("reportId");
    if (!reportIdParam) return;

    if (selectedReportId !== reportIdParam) {
      setSelectedReportId(reportIdParam);
    }

    let active = true;
    async function fetchAndCenter() {
      const existing = incidentsQuery.data?.items.find((r) => r.id === reportIdParam);
      if (existing) {
        setMapCenter({ lat: existing.lat, lng: existing.lng });
        return;
      }
      const { data } = await supabase.from("reports").select("display_lat, display_lng").eq("id", reportIdParam).single();
      if (active && data) {
        setMapCenter({ lat: data.display_lat, lng: data.display_lng });
      }
    }

    fetchAndCenter();

    return () => {
      active = false;
    };
  }, [searchParams, selectedReportId, setSelectedReportId, supabase, setMapCenter, incidentsQuery.data?.items]);

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

  const mobileMapControlOffsetClass = useMemo(() => {
    if (!isMobile || activeTab !== "map" || mobileMapOverlayMode !== "sheet") {
      return "bottom-[calc(env(safe-area-inset-bottom)+5.75rem)]";
    }
    if (mobileMapSheetSnap === "collapsed") {
      return "bottom-[calc(env(safe-area-inset-bottom)+10.2rem)]";
    }
    if (mobileMapSheetSnap === "half") {
      return "bottom-[calc(env(safe-area-inset-bottom)+18.4rem)]";
    }
    return "bottom-[calc(env(safe-area-inset-bottom)+22.8rem)]";
  }, [activeTab, isMobile, mobileMapOverlayMode, mobileMapSheetSnap]);

  return (
    <section className="mx-auto w-full max-w-6xl space-y-5 pb-24">
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

      {showWeatherAlertsLayer && weatherQuery.error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">
          <AlertCircle className="h-4 w-4" />
          Weather unavailable. Alert overlays are temporarily disabled.
        </div>
      ) : null}

      {hasMoreInViewport ? (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm text-amber-100">Zoom in to see more incidents in this area.</div>
      ) : null}

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "map" | "feed")}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="map" className="min-h-10 flex-1 sm:flex-none">
            Map
          </TabsTrigger>
          <TabsTrigger value="feed" className="min-h-10 flex-1 sm:flex-none">
            Feed
          </TabsTrigger>
        </TabsList>

        <TabsContent value="map" className="space-y-3" forceMount>
          <div className="relative">
            <IncidentMap
              reports={reports}
              selectedReportId={selectedReportId}
              center={mapCenter}
              userLocation={userLocation}
              isActive={activeTab === "map"}
              weatherAlerts={weatherQuery.data?.alerts ?? []}
              weatherAlertCenter={weatherTarget.coordinates}
              showWeatherAlerts={showWeatherAlertsLayer}
              searchTarget={selectedSearchLocation}
              onSelectReport={setSelectedReportId}
              onOpenWeatherAlerts={() => openWeatherPanel("alerts")}
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
              mobileControlsOffsetClassName={mobileMapControlOffsetClass}
            />
            <CategoryLayerControl
              weatherAlertsCount={weatherQuery.data?.alerts.length ?? 0}
              weatherLoading={weatherQuery.isFetching && !weatherQuery.data}
              onOpenWeatherPanel={() => openWeatherPanel("overview")}
            />
            <MobileMapControlsSheet
              searchValue={searchQuery}
              onSearchChange={setSearchQuery}
              onSelectLocation={onSelectLocation}
              onClearSearch={clearSelectedLocation}
              getProximity={() => mapCenter}
              weatherAlertsCount={weatherQuery.data?.alerts.length ?? 0}
              weatherLoading={weatherQuery.isFetching && !weatherQuery.data}
              onOpenWeatherPanel={() => openWeatherPanel("overview")}
            />
          </div>

          {incidentsQuery.isFetching ? <p className="text-xs text-[color:var(--muted)]">Refreshing map incidents...</p> : null}

          {!isMobile ? (
            <LocationSearch
              value={searchQuery}
              onChange={setSearchQuery}
              onSelectLocation={onSelectLocation}
              onClearSearch={clearSelectedLocation}
              getProximity={() => mapCenter}
            />
          ) : null}

          {selectedReport ? (
            <Card>
              <CardContent className="space-y-3 p-4">
                <Link href={`/report/${selectedReport.id}`} className="block space-y-2">
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
                </Link>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    size="sm"
                    className="min-h-11 w-full sm:w-auto"
                    variant={selectedReport.user_vote === "confirm" ? "default" : "ghost"}
                    disabled={selectedReportVoteMutation.isPending}
                    onClick={() => void handleSelectedReportVote("confirm")}
                  >
                    {selectedReportVoteMutation.isPending ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                    Confirm ({selectedReport.confirms})
                  </Button>
                  <Button
                    size="sm"
                    className="min-h-11 w-full sm:w-auto"
                    variant={selectedReport.user_vote === "dispute" ? "destructive" : "ghost"}
                    disabled={selectedReportVoteMutation.isPending}
                    onClick={() => void handleSelectedReportVote("dispute")}
                  >
                    {selectedReportVoteMutation.isPending ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <CircleAlert className="mr-1.5 h-4 w-4" />}
                    Dispute ({selectedReport.disputes})
                  </Button>
                </div>
              </CardContent>
            </Card>
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
