"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MapPin, Search } from "lucide-react";
import { type KeyboardEventHandler, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUiToast } from "@/hooks/use-ui-toast";
import { jsonFetch } from "@/lib/queries/fetcher";
import { type GeocodeFeature, geocodeResponseSchema, type GeocodeResponse } from "@/lib/schemas/geocode";
import { cn } from "@/lib/utils";

type LocationSearchProps = {
  value: string;
  onChange: (value: string) => void;
  onSelectLocation: (payload: { id: string; label: string; lat: number; lng: number }) => void;
  getProximity?: () => { lat: number; lng: number } | null;
  placeholder?: string;
  className?: string;
  onClearSearch?: () => void;
};

const GEOCODE_STALE_MS = 60_000;

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debounced;
}

function geocodeQueryKey(query: string, proximity: string) {
  return ["geocode-search", query.toLowerCase(), proximity] as const;
}

async function fetchGeocode(query: string, proximity: { lat: number; lng: number } | null, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query });
  if (proximity) {
    params.set("proximity", `${proximity.lng},${proximity.lat}`);
  }

  const payload = await jsonFetch<unknown>(`/api/geocode?${params.toString()}`, {
    cache: "no-store",
    signal
  });

  const parsed = geocodeResponseSchema.safeParse(payload);
  if (!parsed.success) throw new Error("Invalid geocode response");
  return parsed.data;
}

function isValidCenter(feature: GeocodeFeature | undefined): feature is GeocodeFeature {
  if (!feature) return false;
  return Number.isFinite(feature.center.lng) && Number.isFinite(feature.center.lat);
}

export function LocationSearch({
  value,
  onChange,
  onSelectLocation,
  getProximity,
  placeholder = "Type address or place",
  className,
  onClearSearch
}: LocationSearchProps) {
  const uiToast = useUiToast();
  const queryClient = useQueryClient();
  const [suggestions, setSuggestions] = useState<GeocodeFeature[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [isBestMatchPending, setIsBestMatchPending] = useState(false);
  const blurTimeoutRef = useRef<number | null>(null);
  const lastErrorRef = useRef<string | null>(null);
  const suggestionsId = useId();

  const proximity = getProximity?.() ?? null;
  const trimmedValue = value.trim();
  const debouncedQuery = useDebouncedValue(trimmedValue, 320);
  const proximityKey = useMemo(
    () => (proximity ? `${proximity.lng.toFixed(3)},${proximity.lat.toFixed(3)}` : "global"),
    [proximity]
  );

  const geocodeQuery = useQuery({
    queryKey: geocodeQueryKey(debouncedQuery, proximityKey),
    enabled: debouncedQuery.length >= 2,
    staleTime: GEOCODE_STALE_MS,
    queryFn: ({ signal }) => fetchGeocode(debouncedQuery, proximity, signal)
  });

  const isBusy = (geocodeQuery.isFetching && debouncedQuery.length >= 2) || isBestMatchPending;
  const shouldShowDropdown = isOpen && trimmedValue.length >= 2;

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSuggestions([]);
      setActiveIndex(-1);
      return;
    }

    setSuggestions(geocodeQuery.data?.features ?? []);
  }, [debouncedQuery.length, geocodeQuery.data?.features]);

  useEffect(() => {
    if (!geocodeQuery.error) {
      lastErrorRef.current = null;
      return;
    }

    const message = geocodeQuery.error instanceof Error ? geocodeQuery.error.message : "Unable to search addresses";
    if (lastErrorRef.current === message) return;

    lastErrorRef.current = message;
    uiToast.error("Location search failed", message);
  }, [geocodeQuery.error, uiToast]);

  useEffect(
    () => () => {
      if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current);
    },
    []
  );

  const selectSuggestion = useCallback(
    (suggestion: GeocodeFeature) => {
      if (!isValidCenter(suggestion)) {
        uiToast.info("No results", "Pick another suggestion.");
        return;
      }

      onChange(suggestion.label);
      onSelectLocation({
        id: suggestion.id,
        label: suggestion.label,
        lat: suggestion.center.lat,
        lng: suggestion.center.lng
      });
      setIsOpen(false);
      setActiveIndex(-1);
    },
    [onChange, onSelectLocation, uiToast]
  );

  const runBestMatch = useCallback(async () => {
    const query = value.trim();
    if (query.length < 2) return;

    setIsBestMatchPending(true);

    try {
      const result = await queryClient.fetchQuery<GeocodeResponse>({
        queryKey: geocodeQueryKey(query, proximityKey),
        staleTime: GEOCODE_STALE_MS,
        queryFn: ({ signal }) => fetchGeocode(query, proximity, signal)
      });

      setSuggestions(result.features);
      if (!result.features.length) {
        setIsOpen(true);
        setActiveIndex(-1);
        return;
      }

      selectSuggestion(result.features[0]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to search addresses";
      uiToast.error("Location search failed", message);
    } finally {
      setIsBestMatchPending(false);
    }
  }, [proximity, proximityKey, queryClient, selectSuggestion, uiToast, value]);

  const clearSearchSelection = () => {
    onChange("");
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    onClearSearch?.();
  };

  const onKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === "ArrowDown") {
      if (trimmedValue.length < 2) return;
      event.preventDefault();
      setIsOpen(true);
      if (!suggestions.length) return;
      setActiveIndex((current) => (current + 1 + suggestions.length) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      if (trimmedValue.length < 2) return;
      event.preventDefault();
      setIsOpen(true);
      if (!suggestions.length) return;
      setActiveIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0 && activeIndex < suggestions.length && isValidCenter(suggestions[activeIndex])) {
        selectSuggestion(suggestions[activeIndex]);
        return;
      }

      void runBestMatch();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className={cn("relative z-[80] rounded-2xl border border-[var(--border)] bg-[rgba(9,14,27,0.72)] p-3", className)}>
      <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--muted)]">Search Address</p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" />
        <Input
          value={value}
          placeholder={placeholder}
          className="pl-9 pr-16"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={shouldShowDropdown}
          aria-controls={suggestionsId}
          aria-activedescendant={activeIndex >= 0 ? `${suggestionsId}-${activeIndex}` : undefined}
          onChange={(event) => {
            onChange(event.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            if (trimmedValue.length >= 2) setIsOpen(true);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            if (blurTimeoutRef.current) window.clearTimeout(blurTimeoutRef.current);
            blurTimeoutRef.current = window.setTimeout(() => {
              setIsOpen(false);
              setActiveIndex(-1);
            }, 110);
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="absolute right-1 top-1/2 h-8 -translate-y-1/2 px-2 text-xs"
          onMouseDown={(event) => event.preventDefault()}
          onClick={clearSearchSelection}
        >
          Clear
        </Button>
      </div>

      {shouldShowDropdown ? (
        <div className="absolute left-3 right-3 top-[calc(100%-2px)] z-[90] mt-2 overflow-hidden rounded-xl border border-[rgba(124,146,184,0.45)] bg-[rgba(7,11,20,0.98)] shadow-[0_20px_34px_rgba(0,0,0,0.45)]">
          {isBusy ? (
            <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-[color:var(--muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </div>
          ) : null}

          {!isBusy && suggestions.length === 0 ? (
            <div className="px-3 py-2.5 text-sm text-[color:var(--muted)]">No matching locations found.</div>
          ) : null}

          {!isBusy && suggestions.length > 0 ? (
            <ul id={suggestionsId} role="listbox" className="max-h-72 overflow-auto py-1">
              {suggestions.map((suggestion, index) => (
                <li key={suggestion.id}>
                  <button
                    id={`${suggestionsId}-${index}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-[var(--fg)] transition-colors",
                      index === activeIndex ? "bg-[rgba(34,211,238,0.14)]" : "hover:bg-[rgba(118,144,189,0.12)]"
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectSuggestion(suggestion);
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                    <span className="line-clamp-2">{suggestion.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <p className="mt-2 text-xs text-[color:var(--muted)]">Suggestions are biased near your current map center.</p>
    </div>
  );
}
