import { create } from "zustand";
import type { GeocodeFeature } from "@/lib/schemas/geocode";

type SelectedSearchLocation = {
  id: string;
  label: string;
  lng: number;
  lat: number;
};

type MapSearchState = {
  searchQuery: string;
  suggestions: GeocodeFeature[];
  activeIndex: number;
  selectedLocation: SelectedSearchLocation | null;
  setSearchQuery: (value: string) => void;
  setSuggestions: (features: GeocodeFeature[]) => void;
  setActiveIndex: (value: number) => void;
  setSelectedLocation: (value: SelectedSearchLocation | null) => void;
  clearSelectedLocation: () => void;
};

export const useMapSearchStore = create<MapSearchState>((set) => ({
  searchQuery: "",
  suggestions: [],
  activeIndex: -1,
  selectedLocation: null,
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSuggestions: (suggestions) => set({ suggestions }),
  setActiveIndex: (activeIndex) => set({ activeIndex }),
  setSelectedLocation: (selectedLocation) => set({ selectedLocation }),
  clearSelectedLocation: () => set({ selectedLocation: null })
}));
