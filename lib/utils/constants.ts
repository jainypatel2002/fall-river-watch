export const INCIDENT_CATEGORIES = [
  "road_hazard",
  "traffic_closure",
  "outage",
  "weather_hazard",
  "lost_pet",
  "suspicious_activity"
] as const;

export const INCIDENT_STATUSES = [
  "unverified",
  "verified",
  "disputed",
  "resolved",
  "expired"
] as const;

export const TIME_WINDOWS = ["1h", "6h", "24h", "7d"] as const;
export const RADIUS_OPTIONS = [0.5, 1, 3, 5] as const;

export const STATUS_COLORS: Record<(typeof INCIDENT_STATUSES)[number], string> = {
  unverified: "bg-amber-100 text-amber-900 border-amber-300",
  verified: "bg-emerald-100 text-emerald-900 border-emerald-300",
  disputed: "bg-rose-100 text-rose-900 border-rose-300",
  resolved: "bg-slate-200 text-slate-900 border-slate-300",
  expired: "bg-zinc-200 text-zinc-800 border-zinc-300"
};
