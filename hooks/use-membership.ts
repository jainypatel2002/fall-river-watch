"use client";

import { useGroupMembershipQuery } from "@/lib/queries/groups";

export function useGroupMembership(groupId: string) {
  const query = useGroupMembershipQuery(groupId);

  return {
    membership: query.data?.membership ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch
  };
}

export const useMembership = useGroupMembership;
