"use client";

import { Search } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { NEWS_CATEGORIES, NEWS_CATEGORY_LABELS, type NewsCategory } from "@/lib/types/news";

export type NewsFiltersValue = {
  category: "all" | NewsCategory;
  source: "all" | string;
  officialOnly: boolean;
  search: string;
};

type NewsFiltersProps = {
  value: NewsFiltersValue;
  sources: string[];
  onChange: (next: NewsFiltersValue) => void;
};

export function NewsFilters({ value, sources, onChange }: NewsFiltersProps) {
  return (
    <section className="surface-card space-y-3 p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="news-category">Category</Label>
          <Select
            value={value.category}
            onValueChange={(next) => onChange({ ...value, category: next as NewsFiltersValue["category"] })}
          >
            <SelectTrigger id="news-category" className="h-11">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {NEWS_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {NEWS_CATEGORY_LABELS[category]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="news-source">Source</Label>
          <Select value={value.source} onValueChange={(next) => onChange({ ...value, source: next })}>
            <SelectTrigger id="news-source" className="h-11">
              <SelectValue placeholder="All sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {sources.map((source) => (
                <SelectItem key={source} value={source}>
                  {source}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="news-search">Search title</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" />
            <Input
              id="news-search"
              value={value.search}
              onChange={(event) => onChange({ ...value, search: event.target.value })}
              placeholder="Search headlines"
              className="h-11 pl-9"
            />
          </div>
        </div>

        <div className="flex min-h-11 items-center justify-between rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.75)] px-3">
          <Label htmlFor="news-official-only" className="cursor-pointer text-sm">
            Official only
          </Label>
          <Switch
            id="news-official-only"
            checked={value.officialOnly}
            onCheckedChange={(checked) => onChange({ ...value, officialOnly: checked })}
          />
        </div>
      </div>
    </section>
  );
}
