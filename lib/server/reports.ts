import { parseTimeWindowToHours } from "@/lib/utils/geo";

export async function runReportExpiration(supabase: {
  rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
}) {
  const { error } = await supabase.rpc("expire_reports");
  if (error) {
    console.error("expire_reports failed", error.message);
  }
}

export function getTimeWindowHours(timeWindow: "1h" | "6h" | "24h" | "7d") {
  return parseTimeWindowToHours(timeWindow);
}
