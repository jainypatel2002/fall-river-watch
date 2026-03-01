"use client";

import { useState } from "react";
import { Ban, CloudRain, Layers3, LoaderCircle, PawPrint, ShieldAlert, TriangleAlert, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { INCIDENT_CATEGORY_META } from "@/lib/incidents/categories";
import { useUiStore } from "@/lib/store/ui-store";
import { INCIDENT_CATEGORIES } from "@/lib/utils/constants";
import { cn } from "@/lib/utils";

const iconMap = {
  "triangle-alert": TriangleAlert,
  ban: Ban,
  zap: Zap,
  "cloud-rain": CloudRain,
  "paw-print": PawPrint,
  "shield-alert": ShieldAlert
} as const;

export function CategoryLayerControl({
  weatherAlertsCount = 0,
  weatherLoading = false,
  onOpenWeatherPanel
}: {
  weatherAlertsCount?: number;
  weatherLoading?: boolean;
  onOpenWeatherPanel?: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const categories = useUiStore((state) => state.categories);
  const setCategories = useUiStore((state) => state.setCategories);
  const toggleCategory = useUiStore((state) => state.toggleCategory);
  const showWeatherAlertsLayer = useUiStore((state) => state.showWeatherAlertsLayer);
  const setShowWeatherAlertsLayer = useUiStore((state) => state.setShowWeatherAlertsLayer);
  const showWeatherOverlay = useUiStore((state) => state.showWeatherOverlay);

  const allSelected = categories.length === INCIDENT_CATEGORIES.length;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="pointer-events-auto absolute left-3 top-3 z-20 min-h-11 px-3 md:hidden"
        onClick={() => setMobileOpen(true)}
      >
        <Layers3 className="mr-2 h-4 w-4" />
        Layers
      </Button>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="bottom" className="overflow-y-auto px-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-8 md:hidden">
          <SheetHeader>
            <SheetTitle>Category layers</SheetTitle>
            <SheetDescription>Choose incident categories shown on the map.</SheetDescription>
          </SheetHeader>

          <div className="mt-5 space-y-3">
            <button
              type="button"
              className={cn(
                "inline-flex min-h-11 w-full items-center justify-center rounded-xl border px-3 text-sm",
                allSelected
                  ? "border-[rgba(34,211,238,0.6)] bg-[rgba(34,211,238,0.15)] text-[var(--fg)]"
                  : "border-[var(--border)] bg-[rgba(9,14,27,0.75)] text-[color:var(--muted)]"
              )}
              onClick={() => setCategories([...INCIDENT_CATEGORIES])}
            >
              Show all categories
            </button>

            <div className="space-y-2">
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
                      "inline-flex min-h-11 w-full items-center gap-2 rounded-xl border px-3 text-left text-sm",
                      active
                        ? "border-[rgba(34,211,238,0.6)] bg-[rgba(34,211,238,0.14)] text-[var(--fg)]"
                        : "border-[var(--border)] bg-[rgba(9,14,27,0.75)] text-[color:var(--muted)]"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" style={{ color: meta.color }} />
                    <span className="truncate">{meta.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[rgba(9,14,27,0.78)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Weather Alerts</p>
                  <p className="text-xs text-[color:var(--muted)]">Show weather alerts on map.</p>
                </div>
                <Switch checked={showWeatherAlertsLayer} onCheckedChange={setShowWeatherAlertsLayer} />
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Weather Overlay</p>
                  <p className="text-xs text-[color:var(--muted)]">Precipitation layer (phase 2).</p>
                </div>
                <Switch checked={showWeatherOverlay} onCheckedChange={() => {}} disabled />
              </div>

              <button
                type="button"
                className={cn(
                  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 text-sm",
                  "border-[var(--border)] bg-[rgba(10,15,28,0.72)] text-[var(--fg)]"
                )}
                onClick={() => {
                  onOpenWeatherPanel?.();
                  setMobileOpen(false);
                }}
              >
                {weatherLoading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CloudRain className="h-4 w-4" />}
                Weather details {weatherAlertsCount > 0 ? `(${weatherAlertsCount})` : ""}
              </button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="pointer-events-auto absolute left-3 top-3 z-20 hidden w-[min(80vw,18rem)] space-y-2 rounded-xl border border-[var(--border)] bg-[rgba(6,9,15,0.88)] p-2 shadow-lg backdrop-blur-sm md:block">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">Category layers</p>
          <button
            type="button"
            className={cn(
              "rounded-md border px-2 py-1 text-[11px]",
              allSelected
                ? "border-[rgba(34,211,238,0.6)] bg-[rgba(34,211,238,0.15)] text-[var(--fg)]"
                : "border-[var(--border)] text-[color:var(--muted)] hover:text-[var(--fg)]"
            )}
            onClick={() => setCategories([...INCIDENT_CATEGORIES])}
          >
            All
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1">
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
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[11px]",
                  active
                    ? "border-[rgba(34,211,238,0.6)] bg-[rgba(34,211,238,0.14)] text-[var(--fg)]"
                    : "border-[var(--border)] bg-[rgba(9,14,27,0.75)] text-[color:var(--muted)] hover:text-[var(--fg)]"
                )}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
                <span className="truncate">{meta.label}</span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[rgba(9,14,27,0.72)] p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-[color:var(--muted)]">Weather alerts</p>
            <Switch checked={showWeatherAlertsLayer} onCheckedChange={setShowWeatherAlertsLayer} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-[color:var(--muted)]">Weather overlay</p>
            <Switch checked={showWeatherOverlay} onCheckedChange={() => {}} disabled />
          </div>
          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--border)] bg-[rgba(10,15,28,0.72)] px-2 py-1.5 text-[11px] text-[var(--fg)]"
            onClick={onOpenWeatherPanel}
          >
            {weatherLoading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <CloudRain className="h-3.5 w-3.5" />}
            Weather {weatherAlertsCount > 0 ? `(${weatherAlertsCount})` : ""}
          </button>
        </div>
      </div>
    </>
  );
}
