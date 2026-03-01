"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useUiStore } from "@/lib/store/ui-store";
import { cn } from "@/lib/utils";

export function ReportFab() {
  const isMobile = useMediaQuery("(max-width: 767px)");
  const weatherPanelOpen = useUiStore((state) => state.weatherPanelOpen);
  const mobileRaised = isMobile && weatherPanelOpen;

  return (
    <Link
      href="/report/new"
      className={cn(
        "fixed right-4 z-30 bottom-[calc(env(safe-area-inset-bottom)+1rem)] sm:bottom-5 sm:right-5",
        mobileRaised && "bottom-[calc(env(safe-area-inset-bottom)+18rem)]"
      )}
    >
      <Button
        size="lg"
        className="min-h-12 rounded-full border-[rgba(217,70,239,0.5)] bg-gradient-to-b from-[rgba(42,25,79,0.95)] to-[rgba(12,15,31,0.98)] pr-5 shadow-[0_10px_0_rgba(7,8,16,0.95),0_18px_30px_rgba(11,10,29,0.55)] hover:shadow-[0_12px_0_rgba(7,8,16,0.95),0_20px_32px_rgba(11,10,29,0.58),0_0_20px_rgba(217,70,239,0.4)]"
      >
        <Plus className="mr-1 h-4 w-4" />
        Report
      </Button>
    </Link>
  );
}
