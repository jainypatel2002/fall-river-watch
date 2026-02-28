export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    if (process.env.NODE_ENV === "production" && !process.env.NEXT_PHASE) {
      console.warn("Missing Supabase env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.");
    }
  }

  return {
    url: url || "https://dummy.supabase.co",
    anonKey: anonKey || "dummy_anon_key_for_build"
  };
}
