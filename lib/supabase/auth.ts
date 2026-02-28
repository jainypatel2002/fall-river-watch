import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/server/roles";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error) return { user: null, error };
  return { user, error: null };
}

export async function getCurrentProfile() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, trust_score, role, created_at")
    .eq("id", user.id)
    .single();

  return data;
}

export async function requireAuth() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      user: null,
      supabase,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    };
  }

  return { user, supabase, response: null };
}

export async function requireAdmin() {
  const base = await requireAuth();
  if (!base.user || base.response) return base;

  const admin = await isAdmin(base.supabase, base.user.id);
  if (!admin) {
    return {
      ...base,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 })
    };
  }

  return base;
}
