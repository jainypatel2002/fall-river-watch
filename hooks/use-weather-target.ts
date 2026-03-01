"use client";

import { useMemo } from "react";
import type { WeatherSource } from "@/lib/weather/types";
import { useUiStore } from "@/lib/store/ui-store";

export function useWeatherTarget() {
  const mapCenter = useUiStore((state) => state.mapCenter);
  const userLocation = useUiStore((state) => state.userLocation);
  const weatherLocationMode = useUiStore((state) => state.weatherLocationMode);

  return useMemo(() => {
    let source: WeatherSource = "mapCenter";
    if (weatherLocationMode === "userLocation" && userLocation) {
      source = "userLocation";
    } else if (weatherLocationMode === "mapCenter") {
      source = "mapCenter";
    } else if (userLocation) {
      source = "userLocation";
    }

    const coordinates = source === "userLocation" && userLocation ? userLocation : mapCenter;

    return {
      source,
      coordinates,
      hasUserLocation: Boolean(userLocation),
      mode: weatherLocationMode
    };
  }, [mapCenter, weatherLocationMode, userLocation]);
}
