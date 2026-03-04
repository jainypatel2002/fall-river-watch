"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { GigCard } from "@/components/gigs/gig-card";
import { GigFiltersBar, type GigFiltersValue } from "@/components/gigs/gig-filters-bar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useGigsQuery } from "@/lib/queries/gigs";

const DEFAULT_FILTERS: GigFiltersValue = {
  category: "all",
  payType: "all",
  status: "open",
  q: ""
};

export function GigsShell() {
  const router = useRouter();
  const [filters, setFilters] = useState<GigFiltersValue>(DEFAULT_FILTERS);

  const normalizedFilters = useMemo(
    () => ({
      category: filters.category,
      payType: filters.payType,
      status: filters.status,
      q: filters.q
    }),
    [filters.category, filters.payType, filters.q, filters.status]
  );

  const gigsQuery = useGigsQuery(normalizedFilters);
  const gigs = gigsQuery.data ?? [];

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4 pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontFamily: "var(--font-heading)" }}>
            Gigs
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Local micro-jobs. Keep communication in chat until you trust the match.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/gigs/my">
            <Button variant="outline" className="min-h-11">
              My Gigs
            </Button>
          </Link>
          <Link href="/gigs/new">
            <Button className="min-h-11">
              <Plus className="mr-2 h-4 w-4" />
              Post a Gig
            </Button>
          </Link>
        </div>
      </div>

      <GigFiltersBar value={filters} onChange={setFilters} />

      {gigsQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      ) : null}

      {gigsQuery.isError ? (
        <p className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">
          {(gigsQuery.error as Error).message}
        </p>
      ) : null}

      {!gigsQuery.isLoading && !gigs.length ? (
        <p className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.75)] p-4 text-sm text-[color:var(--muted)]">
          No gigs found with current filters.
        </p>
      ) : null}

      <div className="space-y-3">
        {gigs.map((gig) => (
          <GigCard key={gig.id} gig={gig} onOpen={() => router.push(`/gigs/${gig.id}`)} />
        ))}
      </div>
    </section>
  );
}
