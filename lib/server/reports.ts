import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTimeWindowToHours } from "@/lib/utils/geo";

export async function runReportExpiration(supabase: Pick<SupabaseClient, "rpc">) {
  const { error } = await supabase.rpc("expire_reports");
  if (error) {
    console.error("expire_reports failed", error.message);
  }
}

export function getTimeWindowHours(timeWindow: "1h" | "6h" | "24h" | "7d") {
  return parseTimeWindowToHours(timeWindow);
}
