"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, RefreshCcw } from "lucide-react";
import { NewsCard } from "@/components/news/NewsCard";
import { NewsFilters, type NewsFiltersValue } from "@/components/news/NewsFilters";
import { Button } from "@/components/ui/button";
import { useRole } from "@/hooks/use-role";
import { useSupabaseBrowser } from "@/hooks/use-supabase-browser";
import { useUiToast } from "@/hooks/use-ui-toast";
import type { NewsItemRecord } from "@/lib/types/news";

const PAGE_SIZE = 20;

function sanitizeLikeValue(value: string) {
  return value.replace(/[%_]/g, "").trim();
}

function mergeUniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

const DEFAULT_FILTERS: NewsFiltersValue = {
  category: "all",
  source: "all",
  officialOnly: false,
  search: ""
};

export default function NewsPage() {
  const supabase = useSupabaseBrowser();
  const uiToast = useUiToast();
  const { isMod, isLoading: roleLoading } = useRole();

  const [filters, setFilters] = useState<NewsFiltersValue>(DEFAULT_FILTERS);
  const [items, setItems] = useState<NewsItemRecord[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [clickCounts, setClickCounts] = useState<Record<string, number>>({});

  const requestIdRef = useRef(0);

  const selectedFilters = useMemo(
    () => ({
      category: filters.category,
      source: filters.source,
      officialOnly: filters.officialOnly,
      search: sanitizeLikeValue(filters.search)
    }),
    [filters.category, filters.officialOnly, filters.search, filters.source]
  );
  const isDefaultFilters =
    selectedFilters.category === "all" &&
    selectedFilters.source === "all" &&
    !selectedFilters.officialOnly &&
    selectedFilters.search.length === 0;

  const fetchNewsPage = useCallback(
    async (offset: number, append: boolean) => {
      const requestId = ++requestIdRef.current;
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setError(null);
      }

      try {
        let query = supabase
          .from("news_items")
          .select(
            "id, source_id, source_name, is_official, title, canonical_url, original_url, published_at, summary, image_url, category, city, state, created_at",
            { count: "exact" }
          )
          .order("published_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (selectedFilters.category !== "all") {
          query = query.eq("category", selectedFilters.category);
        }

        if (selectedFilters.source !== "all") {
          query = query.eq("source_name", selectedFilters.source);
        }

        if (selectedFilters.officialOnly) {
          query = query.eq("is_official", true);
        }

        if (selectedFilters.search) {
          query = query.ilike("title", `%${selectedFilters.search}%`);
        }

        const { data, error: queryError, count } = await query;

        if (requestId !== requestIdRef.current) {
          return;
        }

        if (queryError) {
          throw new Error(queryError.message);
        }

        const pageItems = ((data ?? []) as NewsItemRecord[]).filter((item) => Boolean(item.original_url));

        setItems((current) => (append ? [...current, ...pageItems] : pageItems));
        setHasMore(count !== null ? offset + pageItems.length < count : pageItems.length === PAGE_SIZE);
        setSources((current) => mergeUniqueSorted([...current, ...pageItems.map((item) => item.source_name)]));
      } catch (fetchError) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        const message = fetchError instanceof Error ? fetchError.message : "Failed to load local news";
        setError(message);
        if (!append) {
          setItems([]);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoading(false);
          setIsLoadingMore(false);
        }
      }
    },
    [selectedFilters.category, selectedFilters.officialOnly, selectedFilters.search, selectedFilters.source, supabase]
  );

  useEffect(() => {
    void fetchNewsPage(0, false);
  }, [fetchNewsPage, refreshToken]);

  useEffect(() => {
    let active = true;

    async function hydrateSourceOptions() {
      const { data, error: sourceError } = await supabase
        .from("news_items")
        .select("source_name")
        .order("source_name", { ascending: true })
        .limit(500);

      if (!active || sourceError) {
        return;
      }

      const sourceRows = (data ?? []) as Array<{ source_name: string | null }>;
      const sourceNames = sourceRows
        .map((row) => (typeof row.source_name === "string" ? row.source_name : ""))
        .filter(Boolean);
      setSources((current) => mergeUniqueSorted([...current, ...sourceNames]));
    }

    void hydrateSourceOptions();

    return () => {
      active = false;
    };
  }, [supabase]);

  const handleLoadMore = useCallback(() => {
    if (isLoadingMore || isLoading || !hasMore) {
      return;
    }
    void fetchNewsPage(items.length, true);
  }, [fetchNewsPage, hasMore, isLoading, isLoadingMore, items.length]);

  const handleRefreshNews = useCallback(async () => {
    setIsRefreshing(true);

    try {
      const response = await fetch("/api/news/refresh", {
        method: "POST"
      });

      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; inserted?: number; skipped?: number; items_inserted?: number; items_skipped?: number; error?: string }
        | null;

      if (!response.ok || !body?.ok) {
        throw new Error(body?.error || "Failed to refresh local news");
      }

      const inserted = body.inserted ?? body.items_inserted ?? 0;
      const skipped = body.skipped ?? body.items_skipped ?? 0;
      uiToast.success(`News refreshed (${inserted} new)`, `${skipped} skipped`);
      setRefreshToken((value) => value + 1);
    } catch (refreshError) {
      const message = refreshError instanceof Error ? refreshError.message : "Failed to refresh local news";
      uiToast.error("Refresh failed", message);
    } finally {
      setIsRefreshing(false);
    }
  }, [uiToast]);

  return (
    <section className="mx-auto w-full max-w-5xl space-y-4 pb-20 sm:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl" style={{ fontFamily: "var(--font-heading)" }}>
            Local News
          </h1>
          <p className="mt-1 text-sm text-[color:var(--muted)]">
            Headlines and official city updates, linked to original publishers.
          </p>
        </div>

        {!roleLoading && isMod ? (
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            onClick={() => void handleRefreshNews()}
            disabled={isRefreshing}
          >
            {isRefreshing ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Run News Ingest Now
          </Button>
        ) : null}
      </div>

      <NewsFilters value={filters} sources={sources} onChange={setFilters} />

      {error ? (
        <p className="rounded-2xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">{error}</p>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          <div className="shimmer h-32 rounded-2xl border border-[var(--border)] bg-[rgba(11,16,29,0.72)]" />
          <div className="shimmer h-32 rounded-2xl border border-[var(--border)] bg-[rgba(11,16,29,0.72)]" />
          <div className="shimmer h-32 rounded-2xl border border-[var(--border)] bg-[rgba(11,16,29,0.72)]" />
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.78)] p-4 text-sm text-[color:var(--muted)]">
          {isDefaultFilters
            ? "No news yet. Admins can run refresh to fetch the latest headlines."
            : "No news found for the current filters."}
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <NewsCard
              key={item.id}
              item={item}
              clickCount={clickCounts[item.id] ?? 0}
              onOpen={(openedItem) => {
                setClickCounts((current) => ({
                  ...current,
                  [openedItem.id]: (current[openedItem.id] ?? 0) + 1
                }));
              }}
            />
          ))}
        </div>
      )}

      {hasMore && !isLoading ? (
        <div className="pt-1">
          <Button type="button" variant="outline" className="min-h-11 w-full" onClick={handleLoadMore} disabled={isLoadingMore}>
            {isLoadingMore ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Loading more
              </>
            ) : (
              "Load 20 more"
            )}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
