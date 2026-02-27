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
  unverified: "border-amber-400/40 bg-amber-400/20 text-amber-100",
  verified: "border-emerald-400/45 bg-emerald-400/20 text-emerald-100",
  disputed: "border-rose-400/45 bg-rose-400/20 text-rose-100",
  resolved: "border-cyan-400/45 bg-cyan-400/20 text-cyan-100",
  expired: "border-slate-400/40 bg-slate-400/20 text-slate-100"
};
