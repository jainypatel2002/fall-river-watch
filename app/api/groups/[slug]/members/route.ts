import { NextResponse } from "next/server";
import { loadGroupContext } from "@/lib/server/groups";
import { getUserRole } from "@/lib/server/roles";
import { requireAuth } from "@/lib/supabase/auth";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { slug } = await context.params;
    const role = await getUserRole(auth.supabase, auth.user.id);

    const groupContext = await loadGroupContext({
      supabase: auth.supabase,
      slug,
      userId: auth.user.id,
      role
    });

    if (!groupContext) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    if (!groupContext.canViewContent) {
      return NextResponse.json({ error: "Follow required" }, { status: 403 });
    }

    const { data: rows, error } = await auth.supabase
      .from("group_members")
      .select("user_id, role, status, created_at")
      .eq("group_id", groupContext.group.id)
      .eq("status", "accepted")
      .order("created_at", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const userIds = (rows ?? []).map((row) => row.user_id);
    const { data: profiles } = userIds.length
      ? await auth.supabase.from("profiles").select("id, display_name").in("id", userIds)
      : { data: [] as Array<{ id: string; display_name: string | null }> };

    const profileMap = new Map<string, string>();
    for (const profile of profiles ?? []) {
      profileMap.set(profile.id, profile.display_name?.trim() || "Neighbor");
    }

    const members = (rows ?? []).map((row) => ({
      ...row,
      display_name: profileMap.get(row.user_id) ?? "Neighbor"
    }));

    return NextResponse.json({ members });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
