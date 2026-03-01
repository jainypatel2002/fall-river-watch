"use client";

import { useMemo, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { jsonFetch } from "@/lib/queries/fetcher";
import type { WeatherApiResponse, WeatherSource, WeatherUnits } from "@/lib/weather/types";

const WEATHER_DEBOUNCE_MS = 450;
const WEATHER_STALE_MS = 10 * 60 * 1000;

function roundCoord(value: number) {
  return Math.round(value * 100) / 100;
}

type WeatherTarget = {
  lat: number;
  lng: number;
};

export function useWeatherQuery({
  target,
  source,
  units = "imperial",
  enabled = true
}: {
  target: WeatherTarget;
  source: WeatherSource;
  units?: WeatherUnits;
  enabled?: boolean;
}) {
  const roundedTarget = useMemo(
    () => ({
      lat: roundCoord(target.lat),
      lng: roundCoord(target.lng)
    }),
    [target.lat, target.lng]
  );
  const [debouncedTarget, setDebouncedTarget] = useState(roundedTarget);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedTarget(roundedTarget), WEATHER_DEBOUNCE_MS);
    return () => window.clearTimeout(timeout);
  }, [roundedTarget]);

  return useQuery<WeatherApiResponse>({
    queryKey: ["weather", debouncedTarget.lat, debouncedTarget.lng, units, source],
    enabled: enabled && Number.isFinite(debouncedTarget.lat) && Number.isFinite(debouncedTarget.lng),
    staleTime: WEATHER_STALE_MS,
    gcTime: 60 * 60 * 1000,
    placeholderData: (previous) => previous,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        lat: String(debouncedTarget.lat),
        lng: String(debouncedTarget.lng),
        units,
        source
      });

      return jsonFetch<WeatherApiResponse>(`/api/weather?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        signal
      });
    }
  });
}
