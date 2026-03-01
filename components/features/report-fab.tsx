import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReportFab() {
  return (
    <Link href="/report/new" className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] right-4 z-30 sm:bottom-5 sm:right-5">
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
