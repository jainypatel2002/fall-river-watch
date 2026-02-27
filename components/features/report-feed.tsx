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
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="rounded-2xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm text-rose-100">{error}</p>;
  }

  if (!reports.length) {
    return (
      <p className="rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.78)] p-4 text-sm text-[color:var(--muted)]">
        No incidents in this area. Try expanding your radius or time window.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map((report) => (
        <ReportCard key={report.id} report={report} />
      ))}
    </div>
  );
}
