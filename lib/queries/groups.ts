"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createGroup,
  createGroupPost,
  deleteGroup,
  deleteGroupPost,
  ensureGroupChatIdentity,
  getGroupBySlug,
  getMembership,
  leaveGroup,
  listGroupChatMessages,
  listGroupJoinRequests,
  listGroupMembers,
  listGroupPosts,
  listGroups,
  requestFollowGroup,
  respondToGroupRequest,
  sendGroupChatMessage,
  toggleGroupVisibility,
  updateGroup
} from "@/lib/api/groups";
import { queryKeys } from "@/lib/queries/keys";
import type { CreateGroupInput } from "@/lib/schemas/groups";
import type { GroupVisibility } from "@/lib/types/groups";

export function useGroupsQuery(search: string) {
  return useQuery({
    queryKey: queryKeys.groups(search),
    queryFn: () => listGroups(search),
    placeholderData: (previous) => previous
  });
}

export function useGroupDetailQuery(slug: string) {
  return useQuery({
    queryKey: queryKeys.groupDetail(slug),
    queryFn: () => getGroupBySlug(slug),
    enabled: Boolean(slug)
  });
}

export function useGroupMembershipQuery(groupId: string) {
  return useQuery({
    queryKey: queryKeys.groupMembership(groupId),
    queryFn: () => getMembership(groupId),
    enabled: Boolean(groupId)
  });
}

export function useGroupJoinRequestsQuery(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.groupJoinRequests(slug),
    queryFn: () => listGroupJoinRequests(slug),
    enabled: Boolean(slug) && enabled
  });
}

export function useGroupMembersQuery(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.groupMembers(slug),
    queryFn: () => listGroupMembers(slug),
    enabled: Boolean(slug) && enabled
  });
}

export function useGroupPostsQuery(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.groupPosts(slug),
    queryFn: () => listGroupPosts(slug),
    enabled: Boolean(slug) && enabled
  });
}

export function useGroupChatQuery(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.groupChat(slug),
    queryFn: () => listGroupChatMessages(slug),
    enabled: Boolean(slug) && enabled,
    refetchInterval: enabled ? 15_000 : false
  });
}

export function useGroupAnonIdentityQuery(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.groupChatIdentity(slug),
    queryFn: () => ensureGroupChatIdentity(slug),
    enabled: Boolean(slug) && enabled,
    staleTime: 5 * 60 * 1000
  });
}

export function useCreateGroupMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateGroupInput) => createGroup(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
    }
  });
}

export function useUpdateGroupMutation(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name?: string; description?: string | null }) => updateGroup(slug, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupDetail(slug) });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
    }
  });
}

export function useRequestFollowGroupMutation(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => requestFollowGroup(slug),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupDetail(slug) });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
    }
  });
}

export function useRespondToGroupRequestMutation(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, decision }: { userId: string; decision: "accept" | "reject" }) =>
      respondToGroupRequest(slug, userId, decision),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupJoinRequests(slug) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupMembers(slug) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupDetail(slug) });
    }
  });
}

export function useToggleGroupVisibilityMutation(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (visibility: GroupVisibility) => toggleGroupVisibility(slug, visibility),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupDetail(slug) });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
    }
  });
}

export function useDeleteGroupMutation(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteGroup(slug),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupDetail(slug) });
    }
  });
}

export function useLeaveGroupMutation(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => leaveGroup(slug),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupDetail(slug) });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupPosts(slug) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupChat(slug) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupMembers(slug) });
    }
  });
}

export function useCreateGroupPostMutation(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { title?: string | null; content: string }) => createGroupPost(slug, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupPosts(slug) });
    }
  });
}

export function useDeleteGroupPostMutation(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => deleteGroupPost(slug, postId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupPosts(slug) });
    }
  });
}

export function useSendGroupChatMessageMutation(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { anon_name: string; message: string }) => sendGroupChatMessage(slug, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupChat(slug) });
    }
  });
}
