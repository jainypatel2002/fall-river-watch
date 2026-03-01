"use client";

import { useCallback, useEffect, useRef, useState, type TouchEvent } from "react";
import { AlertCircle, CloudRain, LoaderCircle, LocateFixed, MapPin, RefreshCcw, TriangleAlert, Wind } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useUiToast } from "@/hooks/use-ui-toast";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useWeatherTarget } from "@/hooks/use-weather-target";
import { useWeatherQuery } from "@/lib/queries/weather";
import { cn } from "@/lib/utils";
import { formatAlertEndTime, formatWeatherClock, formatWeatherDay, weatherIconToEmoji, weatherSeverityTone } from "@/lib/weather/format";
import { useUiStore } from "@/lib/store/ui-store";

export function WeatherPanel() {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const uiToast = useUiToast();
  const weatherPanelOpen = useUiStore((state) => state.weatherPanelOpen);
  const weatherPanelSection = useUiStore((state) => state.weatherPanelSection);
  const showWeatherAlertsLayer = useUiStore((state) => state.showWeatherAlertsLayer);
  const showWeatherOverlay = useUiStore((state) => state.showWeatherOverlay);
  const setWeatherPanelOpen = useUiStore((state) => state.setWeatherPanelOpen);
  const setWeatherPanelSection = useUiStore((state) => state.setWeatherPanelSection);
  const setShowWeatherAlertsLayer = useUiStore((state) => state.setShowWeatherAlertsLayer);
  const setShowWeatherOverlay = useUiStore((state) => state.setShowWeatherOverlay);
  const setWeatherLocationMode = useUiStore((state) => state.setWeatherLocationMode);
  const setUserLocation = useUiStore((state) => state.setUserLocation);
  const setMapCenter = useUiStore((state) => state.setMapCenter);
  const setGeolocationDenied = useUiStore((state) => state.setGeolocationDenied);
  const weatherTarget = useWeatherTarget();
  const weatherQuery = useWeatherQuery({
    target: weatherTarget.coordinates,
    source: weatherTarget.source
  });

  const alertsSectionRef = useRef<HTMLDivElement | null>(null);
  const [expandedAlerts, setExpandedAlerts] = useState<Record<string, boolean>>({});
  const [swipeStartY, setSwipeStartY] = useState<number | null>(null);
  const [swipeDelta, setSwipeDelta] = useState(0);

  useEffect(() => {
    if (!weatherPanelOpen || weatherPanelSection !== "alerts") return;
    const timer = window.setTimeout(() => {
      alertsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [weatherPanelOpen, weatherPanelSection]);

  const handleUseMyLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setWeatherLocationMode("mapCenter");
      uiToast.info("Location unavailable", "Geolocation is not supported in this browser. Using map center.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setUserLocation(next);
        setMapCenter(next);
        setGeolocationDenied(false);
        setWeatherLocationMode("userLocation");
        uiToast.success("Weather source updated", "Using your location for weather.");
      },
      () => {
        setGeolocationDenied(true);
        setWeatherLocationMode("mapCenter");
        uiToast.info("Location denied", "Using map center for weather instead.");
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 30_000
      }
    );
  }, [setGeolocationDenied, setMapCenter, setUserLocation, setWeatherLocationMode, uiToast]);

  const handleMapCenterSource = useCallback(() => {
    setWeatherLocationMode("mapCenter");
    uiToast.info("Weather source updated", "Using map center for weather.");
  }, [setWeatherLocationMode, uiToast]);

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!isMobile) return;
    setSwipeStartY(event.touches[0]?.clientY ?? null);
    setSwipeDelta(0);
  };

  const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (!isMobile || swipeStartY === null) return;
    const currentY = event.touches[0]?.clientY ?? swipeStartY;
    const nextDelta = Math.max(0, currentY - swipeStartY);
    setSwipeDelta(nextDelta);
  };

  const handleTouchEnd = () => {
    if (!isMobile) return;
    if (swipeDelta > 90) {
      setWeatherPanelOpen(false);
      setWeatherPanelSection("overview");
    }
    setSwipeStartY(null);
    setSwipeDelta(0);
  };

  const weatherData = weatherQuery.data;
  const hasAlerts = (weatherData?.alerts.length ?? 0) > 0;
  const resolvedSourceLabel = weatherTarget.source === "userLocation" ? "your location" : "map center";

  return (
    <Sheet
      open={weatherPanelOpen}
      onOpenChange={(open) => {
        setWeatherPanelOpen(open);
        if (!open) {
          setWeatherPanelSection("overview");
          setSwipeDelta(0);
          setSwipeStartY(null);
        }
      }}
    >
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={cn(
          "overflow-y-auto",
          isMobile ? "max-h-[82vh] px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-5" : "w-[min(28rem,95vw)] px-5"
        )}
      >
        {isMobile ? (
          <div
            className="mx-auto mb-3 h-1.5 w-14 rounded-full bg-[rgba(148,163,184,0.45)]"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ transform: `translateY(${Math.min(32, swipeDelta)}px)` }}
          />
        ) : null}

        <SheetHeader>
          <SheetTitle style={{ fontFamily: "var(--font-heading)" }}>Weather details</SheetTitle>
          <SheetDescription>
            Conditions for {resolvedSourceLabel}.
            {weatherData?.fetchedAt ? ` Updated ${formatWeatherClock(weatherData.fetchedAt)}.` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={() => void weatherQuery.refetch()}
              disabled={weatherQuery.isFetching}
            >
              {weatherQuery.isFetching ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-1.5 h-4 w-4" />}
              Refresh
            </Button>
            <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={handleUseMyLocation}>
              <LocateFixed className="mr-1.5 h-4 w-4" />
              Use my location
            </Button>
            <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={handleMapCenterSource}>
              <MapPin className="mr-1.5 h-4 w-4" />
              Use map center
            </Button>
          </div>

          <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.72)] p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Show weather alerts on map</p>
                <p className="text-xs text-[color:var(--muted)]">Plot weather alerts as polygons/pins.</p>
              </div>
              <Switch checked={showWeatherAlertsLayer} onCheckedChange={setShowWeatherAlertsLayer} />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Show weather overlay</p>
                <p className="text-xs text-[color:var(--muted)]">Precipitation overlay (phase 2).</p>
              </div>
              <Switch checked={showWeatherOverlay} onCheckedChange={setShowWeatherOverlay} disabled />
            </div>

            {showWeatherOverlay ? <p className="text-xs text-[color:var(--muted)]">Overlay support is coming soon.</p> : null}
          </div>

          {weatherQuery.isLoading && !weatherData ? (
            <div className="flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.72)] p-4 text-sm text-[color:var(--muted)]">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Loading weather...
            </div>
          ) : null}

          {weatherQuery.error && !weatherData ? (
            <div className="space-y-2 rounded-2xl border border-rose-400/35 bg-rose-500/10 p-4 text-sm text-rose-100">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Weather unavailable right now.
              </div>
              <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => void weatherQuery.refetch()}>
                Retry
              </Button>
            </div>
          ) : null}

          {weatherData ? (
            <>
              <section className="rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.72)] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">Now</p>
                <div className="mt-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-4xl font-semibold leading-none">{Math.round(weatherData.current.temp)}°</p>
                    <p className="mt-1 text-sm text-[color:var(--muted)]">{weatherData.current.condition}</p>
                  </div>
                  <div className="text-2xl">{weatherIconToEmoji(weatherData.current.icon)}</div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[color:var(--muted)]">
                  <p>Feels like {Math.round(weatherData.current.feelsLike)}°</p>
                  <p className="inline-flex items-center justify-end gap-1">
                    <Wind className="h-3.5 w-3.5" />
                    Wind {Math.round(weatherData.current.windMph)} mph
                  </p>
                  <p>Humidity {weatherData.current.humidity}%</p>
                  <p className="text-right">
                    Rain chance {weatherData.current.precipProb === null ? "N/A" : `${weatherData.current.precipProb}%`}
                  </p>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">Next Hours</p>
                <div className="overflow-x-auto pb-1">
                  <div className="flex min-w-max gap-2">
                    {weatherData.hourly.map((hour) => (
                      <div
                        key={hour.time}
                        className="w-20 shrink-0 rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.72)] px-2 py-2 text-center text-xs"
                      >
                        <p className="text-[color:var(--muted)]">{formatWeatherClock(hour.time)}</p>
                        <p className="mt-1 text-lg">{weatherIconToEmoji(hour.icon)}</p>
                        <p className="font-semibold">{Math.round(hour.temp)}°</p>
                        <p className="text-[10px] text-[color:var(--muted)]">{hour.pop}%</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">Today / Tomorrow</p>
                <div className="grid grid-cols-2 gap-2">
                  {weatherData.daily.slice(0, 2).map((day) => (
                    <div key={day.date} className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.72)] p-3 text-sm">
                      <p className="text-xs text-[color:var(--muted)]">{formatWeatherDay(day.date)}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="text-lg">{weatherIconToEmoji(day.icon)}</p>
                        <p className="text-xs text-[color:var(--muted)]">{day.pop}% rain</p>
                      </div>
                      <p className="mt-1 text-sm font-semibold">
                        {Math.round(day.high)}° / {Math.round(day.low)}°
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-[color:var(--muted)]">{day.summary}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section ref={alertsSectionRef} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--muted)]">Alerts</p>
                  {hasAlerts ? <span className="text-xs text-[color:var(--muted)]">{weatherData.alerts.length} active</span> : null}
                </div>

                {!hasAlerts ? (
                  <div className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.72)] p-3 text-sm text-[color:var(--muted)]">
                    No active weather alerts for this area.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {weatherData.alerts.map((alert) => {
                      const tone = weatherSeverityTone(alert.severity);
                      const isExpanded = Boolean(expandedAlerts[alert.id]);

                      return (
                        <article
                          key={alert.id}
                          className={cn(
                            "rounded-xl border p-3",
                            tone === "rose" && "border-rose-400/45 bg-rose-500/10",
                            tone === "amber" && "border-amber-300/45 bg-amber-500/10",
                            tone === "cyan" && "border-cyan-300/45 bg-cyan-500/10"
                          )}
                        >
                          <button
                            type="button"
                            className="flex w-full items-start justify-between gap-2 text-left"
                            onClick={() => setExpandedAlerts((prev) => ({ ...prev, [alert.id]: !prev[alert.id] }))}
                          >
                            <div>
                              <p className="inline-flex items-center gap-1 text-sm font-semibold">
                                <TriangleAlert className="h-4 w-4" />
                                {alert.title}
                              </p>
                              <p className="mt-1 text-xs text-[color:var(--muted)]">
                                {alert.severity} • Ends {formatAlertEndTime(alert.endsAt)}
                              </p>
                            </div>
                            <span className="text-xs text-[color:var(--muted)]">{isExpanded ? "Hide" : "Details"}</span>
                          </button>
                          {isExpanded ? <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--fg)]">{alert.description}</p> : null}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>

              <div className="inline-flex items-center gap-2 text-xs text-[color:var(--muted)]">
                <CloudRain className="h-3.5 w-3.5" />
                {weatherData.cached ? "Served from cache." : "Fresh provider data."}
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
