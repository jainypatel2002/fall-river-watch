"use client";

import { Suspense, useSyncExternalStore } from "react";
import { HomeShell } from "@/components/features/home-shell";

const subscribe = () => () => { };
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function HomeShellHydrationSafe() {
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!mounted) {
    return <div className="shimmer h-[62vh] rounded-2xl border border-[var(--border)] bg-[rgba(11,16,29,0.72)]" />;
  }

  return (
    <Suspense fallback={<div className="shimmer h-[62vh] rounded-2xl border border-[var(--border)] bg-[rgba(11,16,29,0.72)]" />}>
      <HomeShell />
    </Suspense>
  );
}
