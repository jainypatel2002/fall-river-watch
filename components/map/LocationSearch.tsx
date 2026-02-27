"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2, MapPin, Search } from "lucide-react";
import { type KeyboardEventHandler, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { useUiToast } from "@/hooks/use-ui-toast";
import { jsonFetch } from "@/lib/queries/fetcher";
import { cn } from "@/lib/utils";

type GeocodeSuggestion = {
  id: string;
  place_name: string;
  center: { lng: number; lat: number };
  bbox?: [number, number, number, number];
  context?: Array<{ id: string; text: string; short_code?: string }>;
};

type GeocodeResponse = {
  suggestions: GeocodeSuggestion[];
};

type LocationSearchProps = {
  proximity: { lat: number; lng: number };
  onSelectLocation: (payload: { id: string; label: string; lat: number; lng: number }) => void;
  className?: string;
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, value]);

  return debounced;
}

export function LocationSearch({ proximity, onSelectLocation, className }: LocationSearchProps) {
  const uiToast = useUiToast();
  const [inputValue, setInputValue] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const blurTimeoutRef = useRef<number | null>(null);
  const lastErrorRef = useRef<string | null>(null);

  const trimmedValue = inputValue.trim();
  const debouncedQuery = useDebouncedValue(trimmedValue, 320);
  const proximityKey = useMemo(
    () => `${proximity.lng.toFixed(3)},${proximity.lat.toFixed(3)}`,
    [proximity.lat, proximity.lng]
  );

  const geocodeQuery = useQuery({
    queryKey: ["geocode-search", debouncedQuery.toLowerCase(), proximityKey],
    enabled: debouncedQuery.length >= 2,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      jsonFetch<GeocodeResponse>(
        `/api/geocode?q=${encodeURIComponent(debouncedQuery)}&proximity=${encodeURIComponent(proximityKey)}`,
        { cache: "no-store", signal }
      )
  });

  const suggestions = geocodeQuery.data?.suggestions ?? [];
  const isBusy = geocodeQuery.isFetching && debouncedQuery.length >= 2;
  const shouldShowDropdown = isOpen && trimmedValue.length >= 2;

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

  const selectSuggestion = (suggestion: GeocodeSuggestion) => {
    setInputValue(suggestion.place_name);
    setIsOpen(false);
    setHighlightedIndex(-1);
    onSelectLocation({
      id: suggestion.id,
      label: suggestion.place_name,
      lat: suggestion.center.lat,
      lng: suggestion.center.lng
    });
  };

  const onKeyDown: KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (!shouldShowDropdown) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!suggestions.length) return;
      setHighlightedIndex((current) => (current + 1) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!suggestions.length) return;
      setHighlightedIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
      return;
    }

    if (event.key === "Enter") {
      if (highlightedIndex < 0 || highlightedIndex >= suggestions.length) return;
      event.preventDefault();
      selectSuggestion(suggestions[highlightedIndex]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <div className={cn("relative z-[80] rounded-2xl border border-[var(--border)] bg-[rgba(9,14,27,0.72)] p-3", className)}>
      <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--muted)]">Search Address</p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" />
        <Input
          value={inputValue}
          placeholder="Type address or place"
          className="pl-9"
          onChange={(event) => {
            setInputValue(event.target.value);
            setIsOpen(true);
            setHighlightedIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            blurTimeoutRef.current = window.setTimeout(() => {
              setIsOpen(false);
              setHighlightedIndex(-1);
            }, 110);
          }}
        />
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
            <ul className="max-h-72 overflow-auto py-1">
              {suggestions.map((suggestion, index) => (
                <li key={suggestion.id}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-[var(--fg)] transition-colors",
                      index === highlightedIndex ? "bg-[rgba(34,211,238,0.14)]" : "hover:bg-[rgba(118,144,189,0.12)]"
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectSuggestion(suggestion);
                    }}
                    onMouseEnter={() => setHighlightedIndex(index)}
                  >
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                    <span className="line-clamp-2">{suggestion.place_name}</span>
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
