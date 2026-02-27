import { formatDistanceToNowStrict } from "date-fns";
import { metersToMiles } from "@/lib/utils/geo";

export function formatRelativeTime(iso: string) {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}

export function formatDistance(meters: number | null) {
  if (meters === null) return "N/A";
  const miles = metersToMiles(meters);
  if (miles < 0.1) return `${Math.round(meters)} m`;
  return `${miles.toFixed(1)} mi`;
}

export function prettyCategory(category: string) {
  return category
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
