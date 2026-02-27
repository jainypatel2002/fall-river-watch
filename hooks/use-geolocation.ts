"use client";

import { useEffect } from "react";
import { useUiStore } from "@/lib/store/ui-store";

export function useGeolocation() {
  const setUserLocation = useUiStore((state) => state.setUserLocation);
  const setMapCenter = useUiStore((state) => state.setMapCenter);
  const setGeolocationDenied = useUiStore((state) => state.setGeolocationDenied);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setGeolocationDenied(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        setUserLocation(coords);
        setMapCenter(coords);
        setGeolocationDenied(false);
      },
      () => {
        setGeolocationDenied(true);
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 30_000
      }
    );
  }, [setGeolocationDenied, setMapCenter, setUserLocation]);
}
