"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createGroup,
  createGroupPost,
  deleteGroup,
  deleteGroupPost,
  ensureGroupChatIdentity,
  getGroupPreferences,
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
  updateGroup,
  upsertGroupPreferences
} from "@/lib/api/groups";
import { queryKeys } from "@/lib/queries/keys";
import type { CreateGroupInput } from "@/lib/schemas/groups";
import type { GroupPost, GroupUserPreferences, GroupVisibility } from "@/lib/types/groups";

type GroupPostsQueryData = { posts: GroupPost[] };
type GroupPreferencesQueryData = {
  preferences: GroupUserPreferences;
  display_name: string;
};

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

export function useGroupPreferencesQuery(slug: string, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.groupPreferences(slug),
    queryFn: () => getGroupPreferences(slug),
    enabled: Boolean(slug) && enabled
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
    mutationFn: (payload: { title?: string | null; content: string; is_anonymous: boolean }) => createGroupPost(slug, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupPosts(slug) });
    }
  });
}

export function useDeleteGroupPostMutation(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) => deleteGroupPost(slug, postId),
    onMutate: async (postId) => {
      const queryKey = queryKeys.groupPosts(slug);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<GroupPostsQueryData>(queryKey);

      if (previous) {
        queryClient.setQueryData<GroupPostsQueryData>(queryKey, {
          posts: previous.posts.filter((post) => post.id !== postId)
        });
      }

      return { previous };
    },
    onError: (error, _postId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.groupPosts(slug), context.previous);
      }

      if (process.env.NODE_ENV !== "production") {
        const parsed = error as Error & { status?: number; payload?: unknown };
        console.log("[group-post-delete] mutation failed", {
          status: parsed.status,
          message: parsed.message,
          payload: parsed.payload
        });
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupPosts(slug) });
    }
  });
}

export function useSendGroupChatMessageMutation(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { message: string; is_anonymous: boolean; anon_name?: string | null }) =>
      sendGroupChatMessage(slug, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupChat(slug) });
    }
  });
}

export function useUpsertGroupPreferencesMutation(slug: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { post_anonymous?: boolean; chat_anonymous?: boolean }) => upsertGroupPreferences(slug, payload),
    onMutate: async (payload) => {
      const queryKey = queryKeys.groupPreferences(slug);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<GroupPreferencesQueryData>(queryKey);

      if (previous) {
        queryClient.setQueryData<GroupPreferencesQueryData>(queryKey, {
          ...previous,
          preferences: {
            ...previous.preferences,
            ...payload
          }
        });
      }

      return { previous };
    },
    onError: (_error, _payload, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.groupPreferences(slug), context.previous);
      }
    },
    onSuccess: (data) => {
      queryClient.setQueryData(queryKeys.groupPreferences(slug), data);
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.groupPreferences(slug) });
    }
  });
}
