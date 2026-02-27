"use client";

import { Filter, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { INCIDENT_CATEGORIES, RADIUS_OPTIONS, TIME_WINDOWS } from "@/lib/utils/constants";
import { prettyCategory } from "@/lib/utils/format";
import { useUiStore } from "@/lib/store/ui-store";

export function FiltersSheet() {
  const {
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
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Filter className="h-4 w-4" />
          Filters
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[22rem] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filter Reports</SheetTitle>
          <SheetDescription>Applied to map + feed query radius around map center.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label>Categories</Label>
            <div className="flex flex-wrap gap-2">
              {INCIDENT_CATEGORIES.map((category) => {
                const selected = categories.includes(category);
                return (
                  <button
                    key={category}
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      selected ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300 bg-white text-zinc-700"
                    }`}
                  >
                    {prettyCategory(category)}
                  </button>
                );
              })}
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label>Time window</Label>
            <div className="grid grid-cols-2 gap-2">
              {TIME_WINDOWS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setTimeWindow(item)}
                  className={`rounded-md border px-2 py-2 text-sm ${
                    timeWindow === item ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-zinc-300"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Distance radius</Label>
            <div className="grid grid-cols-2 gap-2">
              {RADIUS_OPTIONS.map((radius) => (
                <button
                  key={radius}
                  type="button"
                  onClick={() => setRadiusMiles(radius)}
                  className={`rounded-md border px-2 py-2 text-sm ${
                    radiusMiles === radius ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-zinc-300"
                  }`}
                >
                  {radius} mi
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-3">
            <div>
              <Label>Verified only</Label>
              <p className="text-xs text-zinc-600">Only show verified incidents.</p>
            </div>
            <Switch checked={verifiedOnly} onCheckedChange={setVerifiedOnly} />
          </div>

          <Button variant="ghost" className="w-full gap-2" onClick={resetFilters}>
            <RotateCcw className="h-4 w-4" />
            Reset filters
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
