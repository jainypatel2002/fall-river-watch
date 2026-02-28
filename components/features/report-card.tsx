"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleAlert, LoaderCircle, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/features/status-badge";
import { useUiToast } from "@/hooks/use-ui-toast";
import { useVoteMutation } from "@/lib/queries/reports";
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
  user_vote: "confirm" | "dispute" | null;
};

export function ReportCard({ report }: { report: ReportCardData }) {
  const uiToast = useUiToast();
  const voteMutation = useVoteMutation(report.id);

  async function handleVote(voteType: "confirm" | "dispute") {
    const nextVote = report.user_vote === voteType ? null : voteType;

    try {
      await voteMutation.mutateAsync(nextVote);
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      if (status === 401) {
        uiToast.info("Sign in required", "Please sign in to confirm or dispute reports.");
        return;
      }
      uiToast.error((error as Error).message);
    }
  }

  return (
    <Card className="hover:border-[rgba(34,211,238,0.45)]">
      <CardContent className="space-y-3 p-4">
        <Link href={`/report/${report.id}`} className="block">
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
        </Link>

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

        <div className="flex gap-2">
          <Button
            size="sm"
            variant={report.user_vote === "confirm" ? "default" : "ghost"}
            disabled={voteMutation.isPending}
            onClick={() => void handleVote("confirm")}
          >
            {voteMutation.isPending ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
            Confirm
          </Button>
          <Button
            size="sm"
            variant={report.user_vote === "dispute" ? "destructive" : "ghost"}
            disabled={voteMutation.isPending}
            onClick={() => void handleVote("dispute")}
          >
            {voteMutation.isPending ? <LoaderCircle className="mr-1.5 h-4 w-4 animate-spin" /> : <CircleAlert className="mr-1.5 h-4 w-4" />}
            Dispute
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
