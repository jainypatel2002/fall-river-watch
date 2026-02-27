import type { SupabaseClient } from "@supabase/supabase-js";

function startOfUtcDayIso() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0)).toISOString();
}

export async function enforceDailyLimit({
  supabase,
  table,
  userColumn,
  userId,
  limit
}: {
  supabase: SupabaseClient;
  table: "reports" | "report_votes";
  userColumn: "reporter_id" | "voter_id";
  userId: string;
  limit: number;
}) {
  const since = startOfUtcDayIso();
  const query = supabase.from(table).select("id", { head: true, count: "exact" }).eq(userColumn, userId).gte("created_at", since);

  const { count, error } = await query;

  if (error) {
    return { ok: false as const, reason: "Failed to evaluate rate limit" };
  }

  if ((count ?? 0) >= limit) {
    return {
      ok: false as const,
      reason: `Daily limit reached (${limit})`
    };
  }

  return { ok: true as const };
}
