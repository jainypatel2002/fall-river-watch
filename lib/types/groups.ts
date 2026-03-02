export const GROUP_VISIBILITIES = ["public", "private"] as const;
export const GROUP_MEMBER_ROLES = ["owner", "mod", "member"] as const;
export const GROUP_MEMBER_STATUSES = ["pending", "accepted", "rejected", "banned"] as const;

export type GroupVisibility = (typeof GROUP_VISIBILITIES)[number];
export type GroupMemberRole = (typeof GROUP_MEMBER_ROLES)[number];
export type GroupMemberStatus = (typeof GROUP_MEMBER_STATUSES)[number];

export type GroupRecord = {
  id: string;
  owner_user_id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: GroupVisibility;
  city?: string;
  created_at: string;
  updated_at: string;
};

export type GroupMembership = {
  group_id: string;
  user_id: string;
  role: GroupMemberRole;
  status: GroupMemberStatus;
  created_at: string;
};

export type GroupCard = GroupRecord & {
  membership: GroupMembership | null;
  can_manage: boolean;
  accepted_members: number;
};

export type GroupMemberProfile = {
  user_id: string;
  role: GroupMemberRole;
  status: GroupMemberStatus;
  created_at: string;
  display_name: string;
};

export type GroupPost = {
  id: string;
  group_id: string;
  author_user_id: string;
  title: string | null;
  content: string;
  is_anonymous: boolean;
  anon_name: string | null;
  created_at: string;
  updated_at: string;
  author_display_name: string;
  can_manage: boolean;
};

export type GroupChatMessage = {
  id: string;
  group_id: string;
  user_id: string;
  anon_name: string;
  is_anonymous: boolean;
  message: string;
  created_at: string;
  is_owner: boolean;
};

export type GroupUserPreferences = {
  group_id: string;
  user_id: string;
  post_anonymous: boolean;
  chat_anonymous: boolean;
  created_at: string | null;
  updated_at: string | null;
};
