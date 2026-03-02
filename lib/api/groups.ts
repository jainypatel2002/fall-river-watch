import { jsonFetch } from "@/lib/queries/fetcher";
import type { CreateGroupInput } from "@/lib/schemas/groups";
import type {
  GroupCard,
  GroupChatMessage,
  GroupMemberProfile,
  GroupMembership,
  GroupPost,
  GroupRecord,
  GroupUserPreferences,
  GroupVisibility
} from "@/lib/types/groups";

export async function listGroups(search?: string) {
  const query = new URLSearchParams();
  if (search) query.set("search", search);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  return jsonFetch<{ groups: GroupCard[] }>(`/api/groups${suffix}`, {
    method: "GET",
    cache: "no-store"
  });
}

export async function getGroupBySlug(slug: string) {
  return jsonFetch<{
    group: GroupRecord;
    membership: GroupMembership | null;
    can_manage: boolean;
    can_view_content: boolean;
    accepted_members: number;
  }>(`/api/groups/${slug}`, {
    method: "GET",
    cache: "no-store"
  });
}

export async function createGroup(payload: CreateGroupInput) {
  return jsonFetch<{ group: GroupRecord }>("/api/groups", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateGroup(
  slug: string,
  payload: {
    name?: string;
    description?: string | null;
  }
) {
  return jsonFetch<{ group: GroupRecord }>(`/api/groups/${slug}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export async function requestFollowGroup(slug: string) {
  return jsonFetch<{ membership: GroupMembership }>(`/api/groups/${slug}/join`, {
    method: "POST"
  });
}

export async function respondToGroupRequest(slug: string, userId: string, decision: "accept" | "reject") {
  return jsonFetch<{ membership: GroupMembership }>(`/api/groups/${slug}/requests/${userId}`, {
    method: "POST",
    body: JSON.stringify({ decision })
  });
}

export async function toggleGroupVisibility(slug: string, visibility: GroupVisibility) {
  return jsonFetch<{ group: GroupRecord }>(`/api/groups/${slug}/visibility`, {
    method: "POST",
    body: JSON.stringify({ visibility })
  });
}

export async function deleteGroup(slug: string) {
  return jsonFetch<{ ok: true }>(`/api/groups/${slug}`, {
    method: "DELETE"
  });
}

export async function leaveGroup(slug: string) {
  return jsonFetch<{ ok: true }>(`/api/groups/${slug}/membership`, {
    method: "DELETE"
  });
}

export async function listGroupJoinRequests(slug: string) {
  return jsonFetch<{
    requests: GroupMemberProfile[];
  }>(`/api/groups/${slug}/requests`, {
    method: "GET",
    cache: "no-store"
  });
}

export async function listGroupMembers(slug: string) {
  return jsonFetch<{
    members: GroupMemberProfile[];
  }>(`/api/groups/${slug}/members`, {
    method: "GET",
    cache: "no-store"
  });
}

export async function listGroupPosts(slug: string) {
  return jsonFetch<{
    posts: GroupPost[];
  }>(`/api/groups/${slug}/posts`, {
    method: "GET",
    cache: "no-store"
  });
}

export async function createGroupPost(
  slug: string,
  payload: {
    title?: string | null;
    content: string;
    is_anonymous: boolean;
  }
) {
  return jsonFetch<{ post: GroupPost }>(`/api/groups/${slug}/posts`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function deleteGroupPost(slug: string, postId: string) {
  return jsonFetch<{ ok: true }>(`/api/groups/${slug}/posts/${postId}`, {
    method: "DELETE"
  });
}

export async function listGroupChatMessages(slug: string) {
  return jsonFetch<{ messages: GroupChatMessage[] }>(`/api/groups/${slug}/chat`, {
    method: "GET",
    cache: "no-store"
  });
}

export async function ensureGroupChatIdentity(slug: string) {
  return jsonFetch<{ anon_name: string }>(`/api/groups/${slug}/chat/identity`, {
    method: "POST"
  });
}

export async function sendGroupChatMessage(
  slug: string,
  payload: {
    message: string;
    is_anonymous: boolean;
    anon_name?: string | null;
  }
) {
  return jsonFetch<{ message: GroupChatMessage }>(`/api/groups/${slug}/chat`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getGroupPreferences(slug: string) {
  return jsonFetch<{
    preferences: GroupUserPreferences;
    display_name: string;
  }>(`/api/groups/${slug}/preferences`, {
    method: "GET",
    cache: "no-store"
  });
}

export async function upsertGroupPreferences(
  slug: string,
  payload: {
    post_anonymous?: boolean;
    chat_anonymous?: boolean;
  }
) {
  return jsonFetch<{
    preferences: GroupUserPreferences;
    display_name: string;
  }>(`/api/groups/${slug}/preferences`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getMembership(groupId: string) {
  return jsonFetch<{ membership: GroupMembership | null }>(`/api/groups/membership?groupId=${encodeURIComponent(groupId)}`, {
    method: "GET",
    cache: "no-store"
  });
}
