"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSupabaseBrowser } from "@/hooks/use-supabase-browser";

export function useReportsRealtime(enabled = true) {
  const queryClient = useQueryClient();
  const supabase = useSupabaseBrowser();

  useEffect(() => {
    if (!enabled) return;

    const channel = supabase
      .channel("reports-and-votes")
      .on("postgres_changes", { event: "*", schema: "public", table: "reports" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["reports"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "report_votes" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["reports"] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, queryClient, supabase]);
}
