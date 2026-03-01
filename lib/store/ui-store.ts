import { create } from "zustand";
import type { IncidentCategory } from "@/lib/types";
import { INCIDENT_CATEGORIES, RADIUS_OPTIONS, TIME_WINDOWS } from "@/lib/utils/constants";

type MapBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

type UiToast = {
  id: string;
  variant?: "success" | "error" | "info";
  title: string;
  description?: string;
};

type UiState = {
  activeTab: "map" | "feed";
  selectedReportId: string | null;
  filterDrawerOpen: boolean;
  categories: IncidentCategory[];
  timeWindow: (typeof TIME_WINDOWS)[number];
  radiusMiles: (typeof RADIUS_OPTIONS)[number];
  verifiedOnly: boolean;
  mapCenter: { lat: number; lng: number };
  mapBounds: MapBounds | null;
  userLocation: { lat: number; lng: number } | null;
  geolocationDenied: boolean;
  weatherPanelOpen: boolean;
  weatherPanelSection: "overview" | "alerts";
  weatherLocationMode: "auto" | "userLocation" | "mapCenter";
  showWeatherAlertsLayer: boolean;
  showWeatherOverlay: boolean;
  toastQueue: UiToast[];
  setActiveTab: (tab: "map" | "feed") => void;
  setSelectedReportId: (id: string | null) => void;
  setFilterDrawerOpen: (open: boolean) => void;
  setCategories: (categories: IncidentCategory[]) => void;
  toggleCategory: (category: IncidentCategory) => void;
  setTimeWindow: (value: (typeof TIME_WINDOWS)[number]) => void;
  setRadiusMiles: (value: (typeof RADIUS_OPTIONS)[number]) => void;
  setVerifiedOnly: (value: boolean) => void;
  setMapCenter: (coords: { lat: number; lng: number }) => void;
  setMapBounds: (bounds: MapBounds | null) => void;
  setMapViewport: (viewport: { center: { lat: number; lng: number }; bounds: MapBounds }) => void;
  setUserLocation: (coords: { lat: number; lng: number } | null) => void;
  setGeolocationDenied: (value: boolean) => void;
  setWeatherPanelOpen: (open: boolean) => void;
  openWeatherPanel: (section?: "overview" | "alerts") => void;
  setWeatherPanelSection: (section: "overview" | "alerts") => void;
  setWeatherLocationMode: (mode: "auto" | "userLocation" | "mapCenter") => void;
  setShowWeatherAlertsLayer: (value: boolean) => void;
  setShowWeatherOverlay: (value: boolean) => void;
  enqueueToast: (payload: Omit<UiToast, "id"> & { id?: string }) => void;
  dequeueToast: () => UiToast | null;
  resetFilters: () => void;
};

const defaultCenter = { lat: 41.7001, lng: -71.155 };

export const useUiStore = create<UiState>((set, get) => ({
  activeTab: "map",
  selectedReportId: null,
  filterDrawerOpen: false,
  categories: [...INCIDENT_CATEGORIES],
  timeWindow: "24h",
  radiusMiles: 3,
  verifiedOnly: false,
  mapCenter: defaultCenter,
  mapBounds: null,
  userLocation: null,
  geolocationDenied: false,
  weatherPanelOpen: false,
  weatherPanelSection: "overview",
  weatherLocationMode: "auto",
  showWeatherAlertsLayer: false,
  showWeatherOverlay: false,
  toastQueue: [],
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedReportId: (id) => set({ selectedReportId: id }),
  setFilterDrawerOpen: (open) => set({ filterDrawerOpen: open }),
  setCategories: (categories) => set({ categories: categories.length ? categories : [...INCIDENT_CATEGORIES] }),
  toggleCategory: (category) =>
    set((state) => {
      if (state.categories.includes(category)) {
        const next = state.categories.filter((item) => item !== category);
        return { categories: next.length ? next : [...INCIDENT_CATEGORIES] };
      }
      return { categories: [...state.categories, category] };
    }),
  setTimeWindow: (timeWindow) => set({ timeWindow }),
  setRadiusMiles: (radiusMiles) => set({ radiusMiles }),
  setVerifiedOnly: (verifiedOnly) => set({ verifiedOnly }),
  setMapCenter: (mapCenter) => set({ mapCenter }),
  setMapBounds: (mapBounds) => set({ mapBounds }),
  setMapViewport: ({ center, bounds }) => set({ mapCenter: center, mapBounds: bounds }),
  setUserLocation: (userLocation) => set({ userLocation }),
  setGeolocationDenied: (geolocationDenied) => set({ geolocationDenied }),
  setWeatherPanelOpen: (weatherPanelOpen) => set({ weatherPanelOpen }),
  openWeatherPanel: (section = "overview") => set({ weatherPanelOpen: true, weatherPanelSection: section }),
  setWeatherPanelSection: (weatherPanelSection) => set({ weatherPanelSection }),
  setWeatherLocationMode: (weatherLocationMode) => set({ weatherLocationMode }),
  setShowWeatherAlertsLayer: (showWeatherAlertsLayer) => set({ showWeatherAlertsLayer }),
  setShowWeatherOverlay: (showWeatherOverlay) => set({ showWeatherOverlay }),
  enqueueToast: (payload) =>
    set((state) => ({
      toastQueue: [...state.toastQueue, { ...payload, id: payload.id ?? crypto.randomUUID() }]
    })),
  dequeueToast: () => {
    const next = get().toastQueue[0] ?? null;
    if (!next) return null;
    set((state) => ({ toastQueue: state.toastQueue.slice(1) }));
    return next;
  },
  resetFilters: () =>
    set({
      categories: [...INCIDENT_CATEGORIES],
      timeWindow: "24h",
      radiusMiles: 3,
      verifiedOnly: false
    })
}));
