"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster, toast } from "sonner";
import { useUiStore } from "@/lib/store/ui-store";

function ToastBridge() {
  const toastQueue = useUiStore((state) => state.toastQueue);
  const dequeueToast = useUiStore((state) => state.dequeueToast);

  useEffect(() => {
    if (!toastQueue.length) return;
    const next = dequeueToast();
    if (!next) return;

    if (next.variant === "error") {
      toast.error(next.title, { description: next.description });
      return;
    }
    if (next.variant === "success") {
      toast.success(next.title, { description: next.description });
      return;
    }
    toast.message(next.title, { description: next.description });
  }, [dequeueToast, toastQueue.length]);

  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 20_000,
            refetchOnWindowFocus: false,
            retry: 1
          }
        }
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ToastBridge />
      <Toaster
        position="top-right"
        theme="dark"
        richColors
        toastOptions={{
          className: "border border-[var(--border)] bg-[rgba(9,14,27,0.96)] text-[var(--fg)]"
        }}
      />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
