import { NextResponse } from "next/server";
import { createGroupSchema } from "@/lib/schemas/groups";
import { getUserRole } from "@/lib/server/roles";
import { requireAuth } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { GroupCard, GroupMembership } from "@/lib/types/groups";

export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim() ?? "";

    let query = supabase.from("groups").select("*").order("created_at", { ascending: false }).limit(200);

    if (search.length) {
      const normalized = search.replace(/[%_]/g, "");
      query = query.or(`name.ilike.%${normalized}%,description.ilike.%${normalized}%`);
    }

    const { data: groups, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const {
      data: { user }
    } = await supabase.auth.getUser();

    const role = user ? await getUserRole(supabase, user.id) : null;
    const isMod = role === "mod" || role === "admin";

    const groupIds = (groups ?? []).map((group) => group.id);

    const [countResult, membershipResult] = await Promise.all([
      groupIds.length
        ? supabase.rpc("get_group_member_counts", { p_group_ids: groupIds })
        : Promise.resolve({ data: [] as Array<{ group_id: string; accepted_count: number }> }),
      user && groupIds.length
        ? supabase
            .from("group_members")
            .select("group_id, user_id, role, status, created_at")
            .eq("user_id", user.id)
            .in("group_id", groupIds)
        : Promise.resolve({ data: [] as GroupMembership[] })
    ]);

    const countByGroupId = new Map<string, number>();
    for (const row of countResult.data ?? []) {
      countByGroupId.set(row.group_id, Number(row.accepted_count ?? 0));
    }

    const membershipByGroupId = new Map<string, GroupMembership>();
    for (const row of membershipResult.data ?? []) {
      membershipByGroupId.set(row.group_id, row);
    }

    const items: GroupCard[] = (groups ?? []).map((group) => {
      const membership = membershipByGroupId.get(group.id) ?? null;
      const canManage =
        isMod ||
        (Boolean(user) && group.owner_user_id === user?.id) ||
        Boolean(membership && membership.status === "accepted" && membership.role === "mod");

      return {
        ...group,
        membership,
        accepted_members: countByGroupId.get(group.id) ?? 0,
        can_manage: canManage
      };
    });

    return NextResponse.json({ groups: items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load groups";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const payload = createGroupSchema.parse(body);

    const { data, error } = await auth.supabase.rpc("create_group_atomic", {
      p_name: payload.name,
      p_description: payload.description || null,
      p_visibility: payload.visibility
    });

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Failed to create group" }, { status: 400 });
    }

    return NextResponse.json({ group: data }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
