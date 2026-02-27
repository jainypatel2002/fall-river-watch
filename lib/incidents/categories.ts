import { INCIDENT_CATEGORIES } from "@/lib/utils/constants";

export type IncidentCategoryKey = (typeof INCIDENT_CATEGORIES)[number];

export type IncidentCategoryMeta = {
  key: IncidentCategoryKey;
  label: string;
  iconKey: string;
  mapGlyph: string;
  color: string;
};

export const INCIDENT_CATEGORY_META: Record<IncidentCategoryKey, IncidentCategoryMeta> = {
  road_hazard: {
    key: "road_hazard",
    label: "Road Hazard",
    iconKey: "triangle-alert",
    mapGlyph: "▲",
    color: "#f59e0b"
  },
  traffic_closure: {
    key: "traffic_closure",
    label: "Traffic Closure",
    iconKey: "ban",
    mapGlyph: "⛔",
    color: "#fb7185"
  },
  outage: {
    key: "outage",
    label: "Outage",
    iconKey: "zap",
    mapGlyph: "⚡",
    color: "#a78bfa"
  },
  weather_hazard: {
    key: "weather_hazard",
    label: "Weather Hazard",
    iconKey: "cloud-rain",
    mapGlyph: "☔",
    color: "#38bdf8"
  },
  lost_pet: {
    key: "lost_pet",
    label: "Lost Pet",
    iconKey: "paw-print",
    mapGlyph: "🐾",
    color: "#22c55e"
  },
  suspicious_activity: {
    key: "suspicious_activity",
    label: "Suspicious Activity",
    iconKey: "shield-alert",
    mapGlyph: "⚠",
    color: "#f97316"
  }
};

export function isIncidentCategory(value: string): value is IncidentCategoryKey {
  return Object.prototype.hasOwnProperty.call(INCIDENT_CATEGORY_META, value);
}

export function parseIncidentCategories(values: string[]) {
  const parsed = values.filter(isIncidentCategory);
  return parsed.length ? parsed : [...INCIDENT_CATEGORIES];
}
