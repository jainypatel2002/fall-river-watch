"use client";

import { useEffect, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { useSupabaseBrowser } from "@/hooks/use-supabase-browser";
import type { Profile } from "@/lib/types";

type Role = Profile["role"] | null;

type CurrentUserState = {
  isLoading: boolean;
  user: User | null;
  role: Role;
};

function normalizeRole(value: unknown): Role {
  if (value === "admin" || value === "mod" || value === "user") {
    return value;
  }
  return null;
}

export function useCurrentUser() {
  const supabase = useSupabaseBrowser();
  const [state, setState] = useState<CurrentUserState>({
    isLoading: true,
    user: null,
    role: null
  });

  useEffect(() => {
    let active = true;

    const refreshFromSession = async (session?: Session | null) => {
      const nextUser = session?.user ?? (await supabase.auth.getSession()).data.session?.user ?? null;
      if (!active) return;

      if (!nextUser) {
        setState({
          isLoading: false,
          user: null,
          role: null
        });
        return;
      }

      setState((current) => ({
        isLoading: true,
        user: nextUser,
        role: current.user?.id === nextUser.id ? current.role : null
      }));

      const { data, error } = await supabase.from("profiles").select("role").eq("id", nextUser.id).maybeSingle();
      if (!active) return;

      setState({
        isLoading: false,
        user: nextUser,
        role: error ? null : normalizeRole(data?.role)
      });
    };

    void refreshFromSession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, session: Session | null) => {
      void refreshFromSession(session);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  return {
    isLoading: state.isLoading,
    user: state.user,
    role: state.role,
    isAuthenticated: Boolean(state.user),
    isAdmin: state.role === "admin",
    isMod: state.role === "mod" || state.role === "admin"
  };
}
