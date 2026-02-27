import { create } from "zustand";
import { INCIDENT_CATEGORIES, RADIUS_OPTIONS, TIME_WINDOWS } from "@/lib/utils/constants";

type UiState = {
  activeTab: "map" | "feed";
  selectedReportId: string | null;
  filterDrawerOpen: boolean;
  categories: string[];
  timeWindow: (typeof TIME_WINDOWS)[number];
  radiusMiles: (typeof RADIUS_OPTIONS)[number];
  verifiedOnly: boolean;
  mapCenter: { lat: number; lng: number };
  userLocation: { lat: number; lng: number } | null;
  geolocationDenied: boolean;
  setActiveTab: (tab: "map" | "feed") => void;
  setSelectedReportId: (id: string | null) => void;
  setFilterDrawerOpen: (open: boolean) => void;
  toggleCategory: (category: string) => void;
  setTimeWindow: (value: (typeof TIME_WINDOWS)[number]) => void;
  setRadiusMiles: (value: (typeof RADIUS_OPTIONS)[number]) => void;
  setVerifiedOnly: (value: boolean) => void;
  setMapCenter: (coords: { lat: number; lng: number }) => void;
  setUserLocation: (coords: { lat: number; lng: number } | null) => void;
  setGeolocationDenied: (value: boolean) => void;
  resetFilters: () => void;
};

const defaultCenter = { lat: 40.7128, lng: -74.006 };

export const useUiStore = create<UiState>((set) => ({
  activeTab: "map",
  selectedReportId: null,
  filterDrawerOpen: false,
  categories: [...INCIDENT_CATEGORIES],
  timeWindow: "24h",
  radiusMiles: 3,
  verifiedOnly: false,
  mapCenter: defaultCenter,
  userLocation: null,
  geolocationDenied: false,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setSelectedReportId: (id) => set({ selectedReportId: id }),
  setFilterDrawerOpen: (open) => set({ filterDrawerOpen: open }),
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
  setUserLocation: (userLocation) => set({ userLocation }),
  setGeolocationDenied: (geolocationDenied) => set({ geolocationDenied }),
  resetFilters: () =>
    set({
      categories: [...INCIDENT_CATEGORIES],
      timeWindow: "24h",
      radiusMiles: 3,
      verifiedOnly: false
    })
}));
