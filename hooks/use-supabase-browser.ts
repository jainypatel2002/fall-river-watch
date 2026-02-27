"use client";

import { useMemo } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function useSupabaseBrowser() {
  return useMemo(() => createSupabaseBrowserClient(), []);
}
