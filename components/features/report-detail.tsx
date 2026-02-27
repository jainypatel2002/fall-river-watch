"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, MapPin } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/features/status-badge";
import { useReportDetailQuery, useResolveMutation, useVoteMutation } from "@/lib/queries/reports";
import { queryKeys } from "@/lib/queries/keys";
import { useSupabaseBrowser } from "@/hooks/use-supabase-browser";
import { formatRelativeTime, prettyCategory } from "@/lib/utils/format";

export function ReportDetail({ reportId }: { reportId: string }) {
  const queryClient = useQueryClient();
  const supabase = useSupabaseBrowser();

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
    return <div className="h-48 animate-pulse rounded-xl bg-zinc-200" />;
  }

  if (detailQuery.error || !detailQuery.data) {
    return <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{(detailQuery.error as Error)?.message ?? "Report not found"}</p>;
  }

  const report = detailQuery.data.report;
  const mediaUrls = report.media.map((item) => supabase.storage.from("report-media").getPublicUrl(item.storage_path).data.publicUrl);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-zinc-700 underline underline-offset-4">
          Back to map
        </Link>
        <StatusBadge status={report.status} />
      </div>

      <Card>
        <CardHeader className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{prettyCategory(report.category)}</p>
          <CardTitle style={{ fontFamily: "var(--font-heading)" }}>{report.title || "Incident report"}</CardTitle>
          <p className="text-sm text-zinc-600">Reported {formatRelativeTime(report.created_at)}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-zinc-800">{report.description}</p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-zinc-200 p-3 text-sm">
              <p className="text-xs text-zinc-500">Severity</p>
              <p className="font-semibold">{report.severity}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-3 text-sm">
              <p className="text-xs text-zinc-500">Confirms</p>
              <p className="font-semibold">{report.confirms}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-3 text-sm">
              <p className="text-xs text-zinc-500">Disputes</p>
              <p className="font-semibold">{report.disputes}</p>
            </div>
            <div className="rounded-lg border border-zinc-200 p-3 text-sm">
              <p className="text-xs text-zinc-500">Approx location</p>
              <p className="font-semibold">
                {report.display_lat.toFixed(4)}, {report.display_lng.toFixed(4)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={async () => {
                try {
                  await voteMutation.mutateAsync("confirm");
                  toast.success("Vote submitted");
                } catch (error) {
                  toast.error((error as Error).message);
                }
              }}
              disabled={voteMutation.isPending || !!report.user_vote}
              className="gap-1"
            >
              <CheckCircle2 className="h-4 w-4" />
              Confirm
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await voteMutation.mutateAsync("dispute");
                  toast.success("Vote submitted");
                } catch (error) {
                  toast.error((error as Error).message);
                }
              }}
              disabled={voteMutation.isPending || !!report.user_vote}
              className="gap-1"
            >
              <CircleAlert className="h-4 w-4" />
              Dispute
            </Button>
            {report.can_resolve ? (
              <Button
                variant="outline"
                onClick={async () => {
                  try {
                    await resolveMutation.mutateAsync();
                    toast.success("Report marked resolved");
                  } catch (error) {
                    toast.error((error as Error).message);
                  }
                }}
                disabled={resolveMutation.isPending || report.status === "resolved"}
              >
                Mark resolved
              </Button>
            ) : null}
          </div>

          {report.user_vote ? <p className="text-xs text-zinc-600">You already voted: {report.user_vote}</p> : null}

          {mediaUrls.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {mediaUrls.map((url, index) => (
                <img key={url} src={url} alt={`report-media-${index + 1}`} className="h-32 w-full rounded-lg object-cover" />
              ))}
            </div>
          ) : null}

          <div className="inline-flex items-center gap-2 rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-600">
            <MapPin className="h-3.5 w-3.5" />
            Suspicious activity locations are always obfuscated before display.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
