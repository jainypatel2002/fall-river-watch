"use client";

import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EVENT_CATEGORIES } from "@/lib/types/events";

export function EventFiltersBar({
  timeframe,
  onTimeframeChange,
  category,
  onCategoryChange,
  search,
  onSearchChange
}: {
  timeframe: "today" | "week" | "all";
  onTimeframeChange: (value: "today" | "week" | "all") => void;
  category: string;
  onCategoryChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[rgba(8,13,24,0.92)] p-3 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-2">
        {([
          ["today", "Today"],
          ["week", "This week"],
          ["all", "All"]
        ] as const).map(([value, label]) => (
          <Button
            key={value}
            type="button"
            size="sm"
            variant={timeframe === value ? "default" : "outline"}
            className="min-h-10"
            onClick={() => onTimeframeChange(value)}
          >
            {label}
          </Button>
        ))}

        <Select value={category} onValueChange={onCategoryChange}>
          <SelectTrigger className="h-10 w-[11rem]">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {EVENT_CATEGORIES.map((item) => (
              <SelectItem key={item} value={item}>
                {item}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative ml-auto min-w-[13rem] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search events"
            className="h-10 pl-9"
          />
        </div>
      </div>
    </div>
  );
}
