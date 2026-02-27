"use client";

import { useUiStore } from "@/lib/store/ui-store";

export function useUiToast() {
  const enqueueToast = useUiStore((state) => state.enqueueToast);

  return {
    success: (title: string, description?: string) => enqueueToast({ variant: "success", title, description }),
    error: (title: string, description?: string) => enqueueToast({ variant: "error", title, description }),
    info: (title: string, description?: string) => enqueueToast({ variant: "info", title, description })
  };
}
