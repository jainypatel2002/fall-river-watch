import { ReportCard, type ReportCardData } from "@/components/features/report-card";
import { Skeleton } from "@/components/ui/skeleton";

export function ReportFeed({
  reports,
  isLoading,
  error
}: {
  reports: ReportCardData[];
  isLoading: boolean;
  error?: string;
}) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>;
  }

  if (!reports.length) {
    return <p className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600">No reports found for the current filters.</p>;
  }

  return (
    <div className="space-y-3">
      {reports.map((report) => (
        <ReportCard key={report.id} report={report} />
      ))}
    </div>
  );
}
