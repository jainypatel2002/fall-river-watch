"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GIG_CATEGORIES, type GigCategory, type GigPayType, type GigStatus } from "@/lib/types/gigs";

export type GigFiltersValue = {
  category: "all" | GigCategory;
  payType: "all" | GigPayType;
  status: "all" | GigStatus;
  q: string;
};

export function GigFiltersBar({
  value,
  onChange
}: {
  value: GigFiltersValue;
  onChange: (next: GigFiltersValue) => void;
}) {
  return (
    <section className="surface-card p-4 sm:p-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="gig-filter-category">Category</Label>
          <Select
            value={value.category}
            onValueChange={(next) => onChange({ ...value, category: next as GigFiltersValue["category"] })}
          >
            <SelectTrigger id="gig-filter-category" className="h-11">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {GIG_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {category.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gig-filter-pay">Pay</Label>
          <Select value={value.payType} onValueChange={(next) => onChange({ ...value, payType: next as GigFiltersValue["payType"] })}>
            <SelectTrigger id="gig-filter-pay" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All pay</SelectItem>
              <SelectItem value="fixed">Fixed</SelectItem>
              <SelectItem value="hourly">Hourly</SelectItem>
              <SelectItem value="free">Free</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gig-filter-status">Status</Label>
          <Select value={value.status} onValueChange={(next) => onChange({ ...value, status: next as GigFiltersValue["status"] })}>
            <SelectTrigger id="gig-filter-status" className="h-11">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="canceled">Canceled</SelectItem>
              <SelectItem value="expired">Expired</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gig-filter-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" />
            <Input
              id="gig-filter-search"
              value={value.q}
              onChange={(event) => onChange({ ...value, q: event.target.value })}
              placeholder="Title or description"
              className="h-11 pl-9"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
