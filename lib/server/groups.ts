import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupMembership, GroupRecord } from "@/lib/types/groups";

export type GroupContext = {
  group: GroupRecord;
  membership: GroupMembership | null;
  canManage: boolean;
  canViewContent: boolean;
  acceptedMembers: number;
};

export async function loadGroupContext({
  supabase,
  slug,
  userId,
  role
}: {
  supabase: Pick<SupabaseClient, "from" | "rpc">;
  slug: string;
  userId: string | null;
  role: "user" | "mod" | "admin" | null;
}): Promise<GroupContext | null> {
  const { data: group, error: groupError } = await supabase.from("groups").select("*").eq("slug", slug).maybeSingle();

  if (groupError || !group) {
    return null;
  }

  const { data: countRows } = await supabase.rpc("get_group_member_counts", {
    p_group_ids: [group.id]
  });

  const acceptedMembers = Number((countRows ?? [])[0]?.accepted_count ?? 0);

  let membership: GroupMembership | null = null;

  if (userId) {
    const { data: membershipRow } = await supabase
      .from("group_members")
      .select("group_id, user_id, role, status, created_at")
      .eq("group_id", group.id)
      .eq("user_id", userId)
      .maybeSingle();

    membership = (membershipRow as GroupMembership | null) ?? null;
  }

  const isMod = role === "mod" || role === "admin";
  const isOwner = Boolean(userId && group.owner_user_id === userId);
  const isGroupMod = membership?.status === "accepted" && membership.role === "mod";
  const isAcceptedMember = membership?.status === "accepted";

  const canManage = isMod || isOwner || isGroupMod;
  const canViewContent = isMod || Boolean(isAcceptedMember);

  return {
    group,
    membership,
    canManage,
    canViewContent,
    acceptedMembers
  };
}
