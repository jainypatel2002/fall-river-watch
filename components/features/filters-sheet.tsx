"use client";

import { Filter, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useUiStore } from "@/lib/store/ui-store";
import { INCIDENT_CATEGORIES, RADIUS_OPTIONS, TIME_WINDOWS } from "@/lib/utils/constants";
import { cn } from "@/lib/utils";
import { prettyCategory } from "@/lib/utils/format";

function ChoicePill({
  label,
  active,
  onClick
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-1.5 text-xs font-medium transition-[border-color,background-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
        active
          ? "border-[rgba(34,211,238,0.6)] bg-[rgba(34,211,238,0.16)] text-[var(--fg)]"
          : "border-[var(--border)] bg-[rgba(9,14,27,0.65)] text-[color:var(--muted)] hover:border-[rgba(34,211,238,0.38)] hover:text-[var(--fg)]"
      )}
    >
      {label}
    </button>
  );
}

export function FiltersSheet() {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const {
    filterDrawerOpen,
    setFilterDrawerOpen,
    categories,
    toggleCategory,
    radiusMiles,
    setRadiusMiles,
    timeWindow,
    setTimeWindow,
    verifiedOnly,
    setVerifiedOnly,
    resetFilters
  } = useUiStore();

  return (
    <Sheet open={filterDrawerOpen} onOpenChange={setFilterDrawerOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Filter className="h-4 w-4" />
          Filters
        </Button>
      </SheetTrigger>
      <SheetContent side={isMobile ? "bottom" : "right"} className={cn("overflow-y-auto", isMobile ? "px-4 pb-7 pt-8" : "w-[24rem]")}>
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Control map + feed scope by category, time window, and radius.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <Label>Categories</Label>
            <div className="flex flex-wrap gap-2">
              {INCIDENT_CATEGORIES.map((category) => (
                <ChoicePill
                  key={category}
                  label={prettyCategory(category)}
                  active={categories.includes(category)}
                  onClick={() => toggleCategory(category)}
                />
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Time Window</Label>
            <div className="grid grid-cols-2 gap-2">
              {TIME_WINDOWS.map((item) => (
                <ChoicePill key={item} label={item} active={timeWindow === item} onClick={() => setTimeWindow(item)} />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Radius</Label>
            <div className="grid grid-cols-2 gap-2">
              {RADIUS_OPTIONS.map((radius) => (
                <ChoicePill key={radius} label={`${radius} mi`} active={radiusMiles === radius} onClick={() => setRadiusMiles(radius)} />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[rgba(11,16,29,0.72)] p-3">
            <div>
              <Label>Verified Only</Label>
              <p className="text-xs text-[color:var(--muted)]">Show incidents with verified community confidence.</p>
            </div>
            <Switch checked={verifiedOnly} onCheckedChange={setVerifiedOnly} />
          </div>

          <Button variant="ghost" className="w-full gap-2" onClick={resetFilters}>
            <RotateCcw className="h-4 w-4" />
            Reset Filters
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
