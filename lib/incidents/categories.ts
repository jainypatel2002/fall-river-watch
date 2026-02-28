import { INCIDENT_CATEGORIES } from "@/lib/utils/constants";

export type IncidentCategoryKey = (typeof INCIDENT_CATEGORIES)[number];

export type IncidentCategoryMeta = {
  key: IncidentCategoryKey;
  label: string;
  iconKey: string;
  mapGlyph: string;
  iconSvg: string;
  color: string;
};

export const INCIDENT_CATEGORY_META: Record<IncidentCategoryKey, IncidentCategoryMeta> = {
  road_hazard: {
    key: "road_hazard",
    label: "Road Hazard",
    iconKey: "triangle-alert",
    mapGlyph: "▲",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
    color: "#f59e0b"
  },
  traffic_closure: {
    key: "traffic_closure",
    label: "Traffic Closure",
    iconKey: "ban",
    mapGlyph: "⛔",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>`,
    color: "#fb7185"
  },
  outage: {
    key: "outage",
    label: "Outage",
    iconKey: "zap",
    mapGlyph: "⚡",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg>`,
    color: "#a78bfa"
  },
  weather_hazard: {
    key: "weather_hazard",
    label: "Weather Hazard",
    iconKey: "cloud-rain",
    mapGlyph: "☔",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg>`,
    color: "#38bdf8"
  },
  lost_pet: {
    key: "lost_pet",
    label: "Lost Pet",
    iconKey: "paw-print",
    mapGlyph: "🐾",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/></svg>`,
    color: "#22c55e"
  },
  suspicious_activity: {
    key: "suspicious_activity",
    label: "Suspicious Activity",
    iconKey: "shield-alert",
    mapGlyph: "⚠",
    iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2-1 4-3 5.99-5a1 1 0 0 1 1.02 0c2 2 4 4 5.99 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>`,
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
