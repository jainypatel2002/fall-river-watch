import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/supabase/env";

let adminClient: ReturnType<typeof createClient> | null = null;

export function createSupabaseAdminClient() {
  if (adminClient) return adminClient;

  const { url } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    if (process.env.NODE_ENV === "production" && !process.env.NEXT_PHASE) {
      console.warn("Missing SUPABASE_SERVICE_ROLE_KEY - Required for admin actions.");
    }
  }

  adminClient = createClient(url, serviceRoleKey || "dummy_key_for_build", {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return adminClient;
}
