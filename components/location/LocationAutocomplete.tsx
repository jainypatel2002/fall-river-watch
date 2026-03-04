"use client";

import { Loader2, MapPin, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { type PlaceSuggestion, searchPlaces } from "@/lib/mapbox";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 300;
const FALLBACK_CITY = "Fall River";
const FALLBACK_STATE = "MA";

export type LocationAutocompleteSelection = {
  location_name: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  full_address?: string;
};

type LocationAutocompleteProps = {
  value: string;
  onChangeText: (text: string) => void;
  onSelect: (payload: LocationAutocompleteSelection) => void;
  placeholder?: string;
  disabled?: boolean;
  inputId?: string;
  className?: string;
  error?: string;
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debounced;
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to search locations.";
}

function toSelectionPayload(location: PlaceSuggestion): LocationAutocompleteSelection {
  const locationName = location.location_name.trim() || location.title.trim() || location.formatted_address.trim();

  return {
    location_name: locationName,
    street: location.street?.trim() ?? "",
    city: location.city?.trim() || FALLBACK_CITY,
    state: location.state?.trim() || FALLBACK_STATE,
    zip: location.zip?.trim() ?? "",
    lat: location.lat,
    lng: location.lng,
    full_address: location.formatted_address.trim() || locationName
  };
}

export function LocationAutocomplete({
  value,
  onChangeText,
  onSelect,
  placeholder = "Type address or place",
  disabled,
  inputId = "location-autocomplete",
  className,
  error
}: LocationAutocompleteProps) {
  const hasMapboxToken = Boolean(process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim());
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [isFocused, setIsFocused] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const listboxId = useId();
  const trimmedValue = value.trim();
  const debouncedValue = useDebouncedValue(trimmedValue, DEBOUNCE_MS);
  const inputDisabled = Boolean(disabled || !hasMapboxToken);
  const shouldShowDropdown = isOpen && isFocused && trimmedValue.length >= 2 && hasMapboxToken;

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setIsOpen(false);
      setActiveIndex(-1);
      setIsFocused(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  useEffect(() => {
    if (previousPathnameRef.current === pathname) return;
    previousPathnameRef.current = pathname;
    searchAbortRef.current?.abort();
    setIsOpen(false);
    setActiveIndex(-1);
    setIsFocused(false);
  }, [pathname]);

  useEffect(() => {
    if (!hasMapboxToken) {
      searchAbortRef.current?.abort();
      setResults([]);
      setActiveIndex(-1);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    if (debouncedValue.length < 2) {
      searchAbortRef.current?.abort();
      setResults([]);
      setActiveIndex(-1);
      setIsSearching(false);
      setSearchError(null);
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearching(true);
    setSearchError(null);

    void searchPlaces(debouncedValue, { signal: controller.signal })
      .then((next) => {
        if (controller.signal.aborted) return;
        setResults(next.slice(0, 6));
        setActiveIndex(next.length ? 0 : -1);
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setResults([]);
        setActiveIndex(-1);
        setSearchError(toErrorMessage(reason));
      })
      .finally(() => {
        if (controller.signal.aborted) return;
        setIsSearching(false);
      });

    return () => controller.abort();
  }, [debouncedValue, hasMapboxToken]);

  const commitSelection = (location: PlaceSuggestion) => {
    const payload = toSelectionPayload(location);
    onChangeText(payload.full_address ?? payload.location_name);
    onSelect(payload);
    setResults([]);
    setIsOpen(false);
    setActiveIndex(-1);
    setSearchError(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      if (!results.length) return;
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((previous) => (previous + 1 + results.length) % results.length);
      return;
    }

    if (event.key === "ArrowUp") {
      if (!results.length) return;
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((previous) => (previous - 1 + results.length) % results.length);
      return;
    }

    if (event.key === "Enter") {
      if (!shouldShowDropdown || activeIndex < 0 || activeIndex >= results.length) return;
      event.preventDefault();
      commitSelection(results[activeIndex]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className={cn("space-y-2", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" />
        <Input
          id={inputId}
          value={value}
          placeholder={placeholder}
          className="h-11 pl-9"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={shouldShowDropdown}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          disabled={inputDisabled}
          onChange={(event) => {
            onChangeText(event.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
            setSearchError(null);
          }}
          onFocus={() => {
            setIsFocused(true);
            setIsOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              if (containerRef.current?.contains(document.activeElement)) return;
              setIsFocused(false);
              setIsOpen(false);
              setActiveIndex(-1);
            }, 0);
          }}
          onKeyDown={onKeyDown}
        />

        {shouldShowDropdown ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.45rem)] z-20 overflow-hidden rounded-xl border border-[rgba(124,146,184,0.45)] bg-[rgba(7,11,20,0.98)] shadow-[0_20px_34px_rgba(0,0,0,0.45)]">
            {isSearching ? (
              <div className="flex items-center gap-2 px-3 py-2.5 text-sm text-[color:var(--muted)]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </div>
            ) : null}

            {!isSearching && results.length === 0 ? (
              <div className="px-3 py-2.5 text-sm text-[color:var(--muted)]">No results.</div>
            ) : null}

            {!isSearching && results.length > 0 ? (
              <ul id={listboxId} role="listbox" className="max-h-72 overflow-auto py-1">
                {results.map((result, index) => (
                  <li key={`${result.place_id ?? result.formatted_address}-${result.lat}-${result.lng}`}>
                    <button
                      id={`${listboxId}-${index}`}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      className={cn(
                        "flex min-h-11 w-full items-start gap-2 px-3 py-2.5 text-left text-sm text-[var(--fg)] transition-colors",
                        index === activeIndex ? "bg-[rgba(34,211,238,0.14)]" : "hover:bg-[rgba(118,144,189,0.12)]"
                      )}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        commitSelection(result);
                      }}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--muted)]" />
                      <span className="space-y-0.5">
                        <span className="block font-medium text-[var(--fg)]">{result.title}</span>
                        <span className="block text-xs text-[color:var(--muted)]">{result.formatted_address}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {!hasMapboxToken ? (
        <p className="text-xs text-amber-200">Location search is unavailable right now. Add NEXT_PUBLIC_MAPBOX_TOKEN to enable suggestions.</p>
      ) : null}
      {searchError ? <p className="text-xs text-rose-300">{searchError}</p> : null}
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
