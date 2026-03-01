"use client";

import { useState } from "react";
import { Ban, CloudRain, Layers3, LoaderCircle, PawPrint, Search, ShieldAlert, TriangleAlert, X, Zap } from "lucide-react";
import { LocationSearch } from "@/components/map/LocationSearch";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useMediaQuery } from "@/hooks/use-media-query";
import { INCIDENT_CATEGORY_META } from "@/lib/incidents/categories";
import { useUiStore } from "@/lib/store/ui-store";
import { INCIDENT_CATEGORIES } from "@/lib/utils/constants";
import { cn } from "@/lib/utils";

type MobileMapControlsSheetProps = {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSelectLocation: (payload: { id: string; label: string; lat: number; lng: number }) => void;
  onClearSearch?: () => void;
  getProximity?: () => { lat: number; lng: number } | null;
  weatherAlertsCount?: number;
  weatherLoading?: boolean;
  onOpenWeatherPanel?: () => void;
};

const iconMap = {
  "triangle-alert": TriangleAlert,
  ban: Ban,
  zap: Zap,
  "cloud-rain": CloudRain,
  "paw-print": PawPrint,
  "shield-alert": ShieldAlert
} as const;

function sectionLabel(open: boolean) {
  return open ? "Hide" : "Show";
}

export function MobileMapControlsSheet({
  searchValue,
  onSearchChange,
  onSelectLocation,
  onClearSearch,
  getProximity,
  weatherAlertsCount = 0,
  weatherLoading = false,
  onOpenWeatherPanel
}: MobileMapControlsSheetProps) {
  const isMobile = useMediaQuery("(max-width: 640px)");
  const overlayMode = useUiStore((state) => state.mobileMapOverlayMode);
  const sheetTab = useUiStore((state) => state.mobileMapSheetTab);
  const sheetSnap = useUiStore((state) => state.mobileMapSheetSnap);
  const setOverlayMode = useUiStore((state) => state.setMobileMapOverlayMode);
  const setSheetTab = useUiStore((state) => state.setMobileMapSheetTab);
  const setSheetSnap = useUiStore((state) => state.setMobileMapSheetSnap);
  const categories = useUiStore((state) => state.categories);
  const setCategories = useUiStore((state) => state.setCategories);
  const toggleCategory = useUiStore((state) => state.toggleCategory);
  const showWeatherAlertsLayer = useUiStore((state) => state.showWeatherAlertsLayer);
  const setShowWeatherAlertsLayer = useUiStore((state) => state.setShowWeatherAlertsLayer);
  const showWeatherOverlay = useUiStore((state) => state.showWeatherOverlay);
  const [categoriesOpen, setCategoriesOpen] = useState(true);
  const [weatherOpen, setWeatherOpen] = useState(true);

  if (!isMobile) return null;

  const allSelected = categories.length === INCIDENT_CATEGORIES.length;
  const overlayOpen = overlayMode === "sheet";

  const openTab = (tab: "search" | "filters") => {
    setOverlayMode("sheet");
    setSheetTab(tab);
    if (sheetSnap === "collapsed") {
      setSheetSnap("half");
    }
  };

  if (!overlayOpen) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <Button
          type="button"
          variant="outline"
          className="pointer-events-auto ml-auto min-h-11 rounded-full px-4"
          onClick={() => {
            setOverlayMode("sheet");
            setSheetTab("search");
            setSheetSnap("collapsed");
          }}
        >
          <Layers3 className="mr-2 h-4 w-4" />
          Controls
        </Button>
      </div>
    );
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 px-2">
      <section
        className={cn(
          "pointer-events-auto rounded-t-3xl border border-[var(--border)] bg-[rgba(6,10,18,0.98)] shadow-[0_-14px_28px_rgba(0,0,0,0.46)] backdrop-blur-md transition-[height] duration-200",
          sheetSnap === "collapsed" && "h-[21%] min-h-[7.75rem]",
          sheetSnap === "half" && "h-[52%] min-h-[18rem]",
          sheetSnap === "full" && "h-[88%] min-h-[21rem]"
        )}
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.75rem)" }}
      >
        <div className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-[rgba(138,160,197,0.5)]" />

        <div className="mt-2 flex items-center gap-2 px-2 pb-2">
          <button
            type="button"
            className="inline-flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.84)] px-3 text-left text-sm text-[var(--fg)]"
            onClick={() => {
              openTab("search");
              setSheetSnap("half");
            }}
          >
            <Search className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
            <span className="truncate">{searchValue.trim().length ? searchValue : "Search address"}</span>
          </button>

          <Button
            type="button"
            variant={sheetTab === "filters" ? "default" : "outline"}
            className="min-h-11 px-3"
            onClick={() => {
              openTab("filters");
              if (sheetSnap === "collapsed") setSheetSnap("half");
            }}
          >
            <Layers3 className="mr-1.5 h-4 w-4" />
            Filters
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            aria-label={sheetSnap === "collapsed" ? "Expand controls" : "Collapse controls"}
            onClick={() => setSheetSnap(sheetSnap === "collapsed" ? "half" : "collapsed")}
          >
            <span aria-hidden className="text-lg leading-none">
              {sheetSnap === "collapsed" ? "↑" : "↓"}
            </span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            aria-label="Close controls"
            onClick={() => {
              setOverlayMode("none");
              setSheetSnap("collapsed");
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {sheetSnap !== "collapsed" ? (
          <div className="h-[calc(100%-4.6rem)] overflow-y-auto px-2 pb-2">
            {sheetTab === "search" ? (
              <div className="space-y-3">
                <LocationSearch
                  value={searchValue}
                  onChange={onSearchChange}
                  onSelectLocation={onSelectLocation}
                  onClearSearch={onClearSearch}
                  getProximity={getProximity}
                  showTitle={false}
                  showHint={false}
                  dropdownMode="inline"
                  className="rounded-2xl border-[var(--border)] bg-[rgba(10,15,28,0.72)]"
                  onInputFocus={() => setSheetSnap("full")}
                />

                <div className="rounded-2xl border border-[var(--border)] bg-[rgba(9,14,27,0.72)] p-3 text-xs text-[color:var(--muted)]">
                  Search suggestions are biased toward your current map center.
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-2xl border border-[var(--border)] bg-[rgba(9,14,27,0.72)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Categories</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[color:var(--muted)]">{allSelected ? "All" : "Customize"}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="min-h-11 px-2 text-xs"
                        onClick={() => setCategories([...INCIDENT_CATEGORIES])}
                      >
                        Select all
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="min-h-11 px-2 text-xs"
                        onClick={() => setCategoriesOpen((value) => !value)}
                        aria-expanded={categoriesOpen}
                        aria-controls="mobile-category-section"
                      >
                        {sectionLabel(categoriesOpen)}
                      </Button>
                    </div>
                  </div>

                  {categoriesOpen ? (
                    <div id="mobile-category-section" className="mt-3 grid grid-cols-2 gap-2">
                      {INCIDENT_CATEGORIES.map((categoryKey) => {
                        const meta = INCIDENT_CATEGORY_META[categoryKey];
                        const Icon = iconMap[meta.iconKey as keyof typeof iconMap] ?? TriangleAlert;
                        const active = categories.includes(categoryKey);

                        return (
                          <button
                            key={categoryKey}
                            type="button"
                            onClick={() => toggleCategory(categoryKey)}
                            className={cn(
                              "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-left text-sm",
                              active
                                ? "border-[rgba(34,211,238,0.62)] bg-[rgba(34,211,238,0.16)] text-[var(--fg)]"
                                : "border-[var(--border)] bg-[rgba(8,12,22,0.72)] text-[color:var(--muted)]"
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0" style={{ color: meta.color }} />
                            <span className="truncate">{meta.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-[var(--border)] bg-[rgba(9,14,27,0.72)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Weather layers</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="min-h-11 px-2 text-xs"
                      onClick={() => setWeatherOpen((value) => !value)}
                      aria-expanded={weatherOpen}
                      aria-controls="mobile-weather-section"
                    >
                      {sectionLabel(weatherOpen)}
                    </Button>
                  </div>

                  {weatherOpen ? (
                    <div id="mobile-weather-section" className="mt-3 space-y-3">
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.72)] p-3">
                        <div>
                          <p className="text-sm">Weather alerts</p>
                          <p className="text-xs text-[color:var(--muted)]">Show weather alerts on map.</p>
                        </div>
                        <Switch
                          checked={showWeatherAlertsLayer}
                          onCheckedChange={setShowWeatherAlertsLayer}
                          aria-label="Toggle weather alerts layer"
                        />
                      </div>

                      <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.72)] p-3">
                        <div>
                          <p className="text-sm">Weather overlay</p>
                          <p className="text-xs text-[color:var(--muted)]">Precipitation layer (phase 2).</p>
                        </div>
                        <Switch checked={showWeatherOverlay} onCheckedChange={() => {}} disabled aria-label="Toggle weather overlay" />
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        className="min-h-11 w-full justify-center"
                        onClick={onOpenWeatherPanel}
                      >
                        {weatherLoading ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <CloudRain className="mr-1.5 h-4 w-4" />}
                        Weather details {weatherAlertsCount > 0 ? `(${weatherAlertsCount})` : ""}
                      </Button>
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
