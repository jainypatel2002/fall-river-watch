import type { SupabaseClient } from "@supabase/supabase-js";

type Role = "user" | "mod" | "admin";

export async function getUserRole(
  supabase: Pick<SupabaseClient, "from">,
  userId: string
): Promise<Role | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return null;
  }

  const role = data?.role;
  if (role === "admin" || role === "mod" || role === "user") {
    return role;
  }

  return null;
}

export async function isAdmin(
  supabase: Pick<SupabaseClient, "from">,
  userId: string
): Promise<boolean> {
  const role = await getUserRole(supabase, userId);
  return role === "admin";
}

export async function isMod(
  supabase: Pick<SupabaseClient, "from">,
  userId: string
): Promise<boolean> {
  const role = await getUserRole(supabase, userId);
  return role === "mod" || role === "admin";
}
