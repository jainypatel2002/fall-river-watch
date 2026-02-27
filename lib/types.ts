import type { INCIDENT_CATEGORIES, INCIDENT_STATUSES } from "@/lib/utils/constants";

export type IncidentCategory = (typeof INCIDENT_CATEGORIES)[number];
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export type ReportRecord = {
  id: string;
  reporter_id: string;
  category: IncidentCategory;
  title: string | null;
  description: string;
  severity: number;
  status: IncidentStatus;
  created_at: string;
  expires_at: string;
  location_lat: number;
  location_lng: number;
  obfuscated_lat: number;
  obfuscated_lng: number;
  distance_meters: number | null;
  confirms: number;
  disputes: number;
  media: Array<{ id: string; storage_path: string; media_type: "image" }>;
};

export type Profile = {
  id: string;
  display_name: string | null;
  trust_score: number;
  role: "user" | "mod" | "admin";
  created_at: string;
};
