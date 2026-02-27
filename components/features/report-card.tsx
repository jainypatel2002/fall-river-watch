import Link from "next/link";
import { AlertTriangle, CircleAlert, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/features/status-badge";
import { prettyCategory, formatDistance, formatRelativeTime } from "@/lib/utils/format";

export type ReportCardData = {
  id: string;
  category: string;
  title: string | null;
  description: string;
  severity: number;
  status: "unverified" | "verified" | "disputed" | "resolved" | "expired";
  created_at: string;
  distance_meters: number | null;
  confirms: number;
  disputes: number;
};

export function ReportCard({ report }: { report: ReportCardData }) {
  return (
    <Link href={`/report/${report.id}`}>
      <Card className="hover:border-[rgba(34,211,238,0.45)]">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{prettyCategory(report.category)}</p>
              <h3 className="text-base font-semibold text-[var(--fg)]">{report.title || "Incident report"}</h3>
            </div>
            <StatusBadge status={report.status} />
          </div>

          <p className="line-clamp-2 text-sm text-[color:var(--muted)]">{report.description}</p>

          <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--muted)]">
            <span className="inline-flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Severity {report.severity}
            </span>
            <span>{formatDistance(report.distance_meters)}</span>
            <span>{formatRelativeTime(report.created_at)}</span>
          </div>

          <div className="flex items-center gap-4 text-xs text-[color:var(--muted)]">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              {report.confirms} confirm
            </span>
            <span className="inline-flex items-center gap-1">
              <CircleAlert className="h-3.5 w-3.5" />
              {report.disputes} dispute
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
