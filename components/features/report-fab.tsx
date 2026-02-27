import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReportFab() {
  return (
    <Link href="/report/new" className="fixed bottom-5 right-5 z-30">
      <Button size="lg" className="rounded-full shadow-lg">
        <Plus className="mr-1 h-4 w-4" />
        Report
      </Button>
    </Link>
  );
}
