"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/features/status-badge";
import { useSupabaseBrowser } from "@/hooks/use-supabase-browser";
import { useUiToast } from "@/hooks/use-ui-toast";
import { queryKeys } from "@/lib/queries/keys";
import { useReportDetailQuery, useResolveMutation, useVoteMutation } from "@/lib/queries/reports";
import { formatRelativeTime, prettyCategory } from "@/lib/utils/format";

export function ReportDetail({ reportId }: { reportId: string }) {
  const queryClient = useQueryClient();
  const supabase = useSupabaseBrowser();
  const uiToast = useUiToast();

  const detailQuery = useReportDetailQuery(reportId);
  const voteMutation = useVoteMutation(reportId);
  const resolveMutation = useResolveMutation(reportId);

  useEffect(() => {
    const channel = supabase
      .channel(`report-${reportId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "reports", filter: `id=eq.${reportId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.reportDetail(reportId) });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "report_votes", filter: `report_id=eq.${reportId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.reportDetail(reportId) });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, reportId, supabase]);

  if (detailQuery.isLoading) {
    return <div className="shimmer h-48 rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.7)]" />;
  }

  if (detailQuery.error || !detailQuery.data) {
    return (
      <p className="rounded-2xl border border-rose-400/40 bg-rose-400/10 p-4 text-sm text-rose-100">
        {(detailQuery.error as Error)?.message ?? "Report not found"}
      </p>
    );
  }

  const report = detailQuery.data.report;
  const mediaUrls = report.media.map((item) => supabase.storage.from("report-media").getPublicUrl(item.storage_path).data.publicUrl);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-[color:var(--muted)] underline underline-offset-4">
          Back to map
        </Link>
        <StatusBadge status={report.status} />
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--muted)]">{prettyCategory(report.category)}</p>
          <CardTitle style={{ fontFamily: "var(--font-heading)" }}>{report.title || "Incident report"}</CardTitle>
          <p className="text-sm text-[color:var(--muted)]">Reported {formatRelativeTime(report.created_at)}</p>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-[var(--fg)]">{report.description}</p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-[var(--border)] bg-[rgba(9,14,27,0.7)] p-3 text-sm">
              <p className="text-xs text-[color:var(--muted)]">Severity</p>
              <p className="font-semibold text-[var(--fg)]">{report.severity}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[rgba(9,14,27,0.7)] p-3 text-sm">
              <p className="text-xs text-[color:var(--muted)]">Confirms</p>
              <p className="font-semibold text-[var(--fg)]">{report.confirms}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[rgba(9,14,27,0.7)] p-3 text-sm">
              <p className="text-xs text-[color:var(--muted)]">Disputes</p>
              <p className="font-semibold text-[var(--fg)]">{report.disputes}</p>
            </div>
            <div className="rounded-xl border border-[var(--border)] bg-[rgba(9,14,27,0.7)] p-3 text-sm">
              <p className="text-xs text-[color:var(--muted)]">Approx location</p>
              <p className="font-semibold text-[var(--fg)]">
                {report.display_lat.toFixed(4)}, {report.display_lng.toFixed(4)}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">Community vote</p>
            <div className="inline-flex rounded-2xl border border-[var(--border)] bg-[rgba(9,14,27,0.74)] p-1">
              <Button
                variant={report.user_vote === "confirm" ? "default" : "ghost"}
                className="rounded-xl"
                onClick={async () => {
                  try {
                    await voteMutation.mutateAsync("confirm");
                    uiToast.success("Vote submitted");
                  } catch (error) {
                    uiToast.error((error as Error).message);
                  }
                }}
                disabled={voteMutation.isPending || !!report.user_vote}
              >
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                Confirm
              </Button>
              <Button
                variant={report.user_vote === "dispute" ? "destructive" : "ghost"}
                className="rounded-xl"
                onClick={async () => {
                  try {
                    await voteMutation.mutateAsync("dispute");
                    uiToast.success("Vote submitted");
                  } catch (error) {
                    uiToast.error((error as Error).message);
                  }
                }}
                disabled={voteMutation.isPending || !!report.user_vote}
              >
                <CircleAlert className="mr-1.5 h-4 w-4" />
                Dispute
              </Button>
            </div>
            {report.user_vote ? <p className="text-xs text-[color:var(--muted)]">You already voted: {report.user_vote}.</p> : null}
          </div>

          {report.can_resolve ? (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await resolveMutation.mutateAsync();
                  uiToast.success("Report marked resolved");
                } catch (error) {
                  uiToast.error((error as Error).message);
                }
              }}
              disabled={resolveMutation.isPending || report.status === "resolved"}
            >
              Mark Resolved
            </Button>
          ) : null}

          {mediaUrls.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {mediaUrls.map((url, index) => (
                <img key={url} src={url} alt={`report-media-${index + 1}`} className="h-32 w-full rounded-xl border border-[var(--border)] object-cover" />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-[var(--border)] bg-[rgba(9,14,27,0.7)] p-3 text-sm text-[color:var(--muted)]">
              No media attached to this report.
            </p>
          )}

          <div className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[rgba(9,14,27,0.74)] px-3 py-2 text-xs text-[color:var(--muted)]">
            <MapPin className="h-3.5 w-3.5" />
            Suspicious activity locations are obfuscated before display.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
