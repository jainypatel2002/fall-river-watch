"use client";

import { useMemo } from "react";
import { useCurrentUser } from "@/hooks/use-current-user";

export function useRole() {
  const currentUser = useCurrentUser();

  return useMemo(
    () => ({
      role: currentUser.role,
      isAdmin: currentUser.role === "admin",
      isMod: currentUser.role === "mod" || currentUser.role === "admin",
      isAuthenticated: currentUser.isAuthenticated,
      isLoading: currentUser.isLoading,
      user: currentUser.user
    }),
    [currentUser.isAuthenticated, currentUser.isLoading, currentUser.role, currentUser.user]
  );
}
