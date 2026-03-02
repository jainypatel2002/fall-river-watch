"use client";

import { Loader2, MapPin, Search } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type PlaceSuggestion, searchPlaces } from "@/lib/mapbox";
import { cn } from "@/lib/utils";

type EventLocationAutocompleteProps = {
  inputId?: string;
  value: string;
  onValueChange: (value: string) => void;
  onSelectLocation: (value: PlaceSuggestion) => void;
  onInvalidateLocation: () => void;
  disabled?: boolean;
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

export function EventLocationAutocomplete({
  inputId = "event-location-search",
  value,
  onValueChange,
  onSelectLocation,
  onInvalidateLocation,
  disabled,
  error
}: EventLocationAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const resolveAbortRef = useRef<AbortController | null>(null);

  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isResolvingTyped, setIsResolvingTyped] = useState(false);

  const listboxId = useId();
  const trimmedValue = value.trim();
  const debouncedValue = useDebouncedValue(trimmedValue, 300);
  const shouldShowDropdown = isOpen && isInputFocused && trimmedValue.length >= 2;

  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
      resolveAbortRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setIsOpen(false);
      setActiveIndex(-1);
      setIsInputFocused(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, []);

  useEffect(() => {
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
        setResults(next);
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
  }, [debouncedValue]);

  const commitSelection = (location: PlaceSuggestion) => {
    onSelectLocation(location);
    onValueChange(location.formatted_address);
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
      if (!shouldShowDropdown) return;
      if (activeIndex < 0 || activeIndex >= results.length) return;
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

  const onResolveTypedLocation = async () => {
    if (trimmedValue.length < 2 || disabled) return;

    resolveAbortRef.current?.abort();
    const controller = new AbortController();
    resolveAbortRef.current = controller;

    setIsResolvingTyped(true);
    setSearchError(null);

    try {
      const matches = await searchPlaces(trimmedValue, { signal: controller.signal });
      if (controller.signal.aborted) return;

      if (!matches.length) {
        setResults([]);
        setActiveIndex(-1);
        setIsOpen(true);
        setSearchError("No results found for that location.");
        return;
      }

      commitSelection(matches[0]);
    } catch (reason) {
      if (controller.signal.aborted) return;
      setSearchError(toErrorMessage(reason));
    } finally {
      if (controller.signal.aborted) return;
      setIsResolvingTyped(false);
    }
  };

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" />
        <Input
          id={inputId}
          value={value}
          placeholder="Start typing an address or place..."
          className="h-11 pl-9"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={shouldShowDropdown}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          disabled={disabled}
          onChange={(event) => {
            onValueChange(event.target.value);
            onInvalidateLocation();
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            setIsInputFocused(true);
            setIsOpen(true);
          }}
          onBlur={() => {
            window.setTimeout(() => {
              if (containerRef.current?.contains(document.activeElement)) return;
              setIsInputFocused(false);
              setIsOpen(false);
              setActiveIndex(-1);
            }, 0);
          }}
          onKeyDown={onKeyDown}
        />

        {shouldShowDropdown ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.45rem)] z-[90] overflow-hidden rounded-xl border border-[rgba(124,146,184,0.45)] bg-[rgba(7,11,20,0.98)] shadow-[0_20px_34px_rgba(0,0,0,0.45)]">
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

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled || trimmedValue.length < 2 || isResolvingTyped}
          onClick={() => void onResolveTypedLocation()}
        >
          {isResolvingTyped ? "Geocoding..." : "Use typed location"}
        </Button>
      </div>

      {searchError ? <p className="text-xs text-rose-300">{searchError}</p> : null}
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
