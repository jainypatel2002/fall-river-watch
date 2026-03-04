"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { GigCard } from "@/components/gigs/gig-card";
import { GigFiltersBar, type GigFiltersValue } from "@/components/gigs/gig-filters-bar";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useGigsQuery, useMyGigApplicationsQuery, useMyGigPostsQuery } from "@/lib/queries/gigs";
import { formatRelativeTime } from "@/lib/utils/format";

const DEFAULT_FILTERS: GigFiltersValue = {
  category: "all",
  payType: "all",
  status: "open",
  q: ""
};

export function MyGigsShell() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const [activeTab, setActiveTab] = useState<"browse" | "posts" | "applications">("posts");
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

  const browseQuery = useGigsQuery(normalizedFilters);
  const postsQuery = useMyGigPostsQuery(user?.id ?? null, activeTab === "posts");
  const applicationsQuery = useMyGigApplicationsQuery(user?.id ?? null, activeTab === "applications");

  return (
    <section className="mx-auto w-full max-w-6xl space-y-4 pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontFamily: "var(--font-heading)" }}>
          My Gigs
        </h1>
        <p className="mt-1 text-sm text-[color:var(--muted)]">Manage your posts and applications in one place.</p>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value="browse">Browse</TabsTrigger>
          <TabsTrigger value="posts">My Posts</TabsTrigger>
          <TabsTrigger value="applications">My Applications</TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-3">
          <GigFiltersBar value={filters} onChange={setFilters} />

          {browseQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </div>
          ) : null}

          {browseQuery.isError ? (
            <p className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">
              {(browseQuery.error as Error).message}
            </p>
          ) : null}

          <div className="space-y-3">
            {(browseQuery.data ?? []).map((gig) => (
              <GigCard key={gig.id} gig={gig} onOpen={() => router.push(`/gigs/${gig.id}`)} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="posts" className="space-y-3">
          {postsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </div>
          ) : null}

          {postsQuery.isError ? (
            <p className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">
              {(postsQuery.error as Error).message}
            </p>
          ) : null}

          {!postsQuery.isLoading && !(postsQuery.data?.length ?? 0) ? (
            <p className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.75)] p-4 text-sm text-[color:var(--muted)]">
              You have not posted any gigs yet.
            </p>
          ) : null}

          <div className="space-y-3">
            {(postsQuery.data ?? []).map((gig) => (
              <GigCard key={gig.id} gig={gig} onOpen={() => router.push(`/gigs/${gig.id}`)} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="applications" className="space-y-3">
          {applicationsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-28" />
              <Skeleton className="h-28" />
            </div>
          ) : null}

          {applicationsQuery.isError ? (
            <p className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">
              {(applicationsQuery.error as Error).message}
            </p>
          ) : null}

          {!applicationsQuery.isLoading && !(applicationsQuery.data?.length ?? 0) ? (
            <p className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.75)] p-4 text-sm text-[color:var(--muted)]">
              You have not applied to any gigs yet.
            </p>
          ) : null}

          <div className="space-y-3">
            {(applicationsQuery.data ?? []).map((item) => (
              <article key={item.application.id} className="rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.75)] p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-[var(--fg)]">{item.gig?.title ?? "Gig unavailable"}</p>
                    <p className="text-xs text-[color:var(--muted)]">{formatRelativeTime(item.application.created_at)}</p>
                    <p className="mt-1 text-xs text-[color:var(--muted)]">Status: {item.application.status}</p>
                  </div>
                  {item.gig ? (
                    <button
                      type="button"
                      className="text-sm text-cyan-200 underline underline-offset-4"
                      onClick={() => router.push(`/gigs/${item.gig?.id}`)}
                    >
                      Open
                    </button>
                  ) : null}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[color:var(--muted)]">{item.application.message}</p>
              </article>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
