"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { StatusBadge } from "@/components/features/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUiToast } from "@/hooks/use-ui-toast";
import { useAdminDeleteReportMutation, useAdminReportStatusMutation, useAdminReportsQuery } from "@/lib/queries/reports";
import { prettyCategory } from "@/lib/utils/format";

function AdminRow({
  report
}: {
  report: {
    id: string;
    title: string | null;
    description: string;
    status: "unverified" | "verified" | "disputed" | "resolved" | "expired";
    category: string;
    created_at: string;
    severity: number;
  };
}) {
  const uiToast = useUiToast();
  const updateStatus = useAdminReportStatusMutation(report.id);
  const deleteReport = useAdminDeleteReportMutation(report.id);

  return (
    <div className="grid gap-3 border-b border-[var(--border)] px-3 py-3 last:border-none md:grid-cols-[1.5fr_0.8fr_0.9fr_auto] md:items-center">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-[var(--fg)]">{report.title || "Untitled report"}</h3>
        <p className="line-clamp-2 text-xs text-[color:var(--muted)]">{report.description}</p>
      </div>

      <div className="text-xs text-[color:var(--muted)]">
        <p>{prettyCategory(report.category)}</p>
        <p>Severity {report.severity}</p>
      </div>

      <div className="flex items-center">
        <StatusBadge status={report.status} />
      </div>

      <div className="flex flex-wrap gap-2 md:justify-end">
        <Select
          onValueChange={async (value) => {
            try {
              await updateStatus.mutateAsync(value as "verified" | "disputed" | "resolved" | "expired");
              uiToast.success("Status updated");
            } catch (error) {
              uiToast.error((error as Error).message);
            }
          }}
        >
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Change status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="verified">verified</SelectItem>
            <SelectItem value="disputed">disputed</SelectItem>
            <SelectItem value="resolved">resolved</SelectItem>
            <SelectItem value="expired">expired</SelectItem>
          </SelectContent>
        </Select>

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive" size="sm">
              Delete
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete report?</DialogTitle>
              <DialogDescription>This action cannot be undone and removes associated content.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="destructive"
                onClick={async () => {
                  try {
                    await deleteReport.mutateAsync();
                    uiToast.success("Report deleted");
                  } catch (error) {
                    uiToast.error((error as Error).message);
                  }
                }}
              >
                Confirm Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

export function AdminDashboard() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");

  const reportsQuery = useAdminReportsQuery({
    search,
    status: status === "all" ? "" : status,
    category: category === "all" ? "" : category
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.78)] p-4 md:grid-cols-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[color:var(--muted)]" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title/description" className="pl-9" />
        </div>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger>
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="unverified">unverified</SelectItem>
            <SelectItem value="verified">verified</SelectItem>
            <SelectItem value="disputed">disputed</SelectItem>
            <SelectItem value="resolved">resolved</SelectItem>
            <SelectItem value="expired">expired</SelectItem>
          </SelectContent>
        </Select>

        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger>
            <SelectValue placeholder="Filter category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            <SelectItem value="road_hazard">road_hazard</SelectItem>
            <SelectItem value="traffic_closure">traffic_closure</SelectItem>
            <SelectItem value="outage">outage</SelectItem>
            <SelectItem value="weather_hazard">weather_hazard</SelectItem>
            <SelectItem value="lost_pet">lost_pet</SelectItem>
            <SelectItem value="suspicious_activity">suspicious_activity</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.78)]">
        <div className="hidden grid-cols-[1.5fr_0.8fr_0.9fr_auto] border-b border-[var(--border)] px-3 py-2 text-xs font-medium uppercase tracking-wide text-[color:var(--muted)] md:grid">
          <p>Report</p>
          <p>Category</p>
          <p>Status</p>
          <p className="text-right">Actions</p>
        </div>

        {reportsQuery.isLoading ? <div className="shimmer h-24 bg-[rgba(10,15,28,0.7)]" /> : null}
        {reportsQuery.error ? (
          <p className="m-3 rounded-xl border border-rose-400/40 bg-rose-400/10 p-4 text-sm text-rose-100">{(reportsQuery.error as Error).message}</p>
        ) : null}

        {(reportsQuery.data?.reports ?? []).map((report) => (
          <AdminRow key={report.id} report={report} />
        ))}

        {!reportsQuery.isLoading && !reportsQuery.error && !(reportsQuery.data?.reports ?? []).length ? (
          <p className="p-4 text-sm text-[color:var(--muted)]">No incidents match the current admin filters.</p>
        ) : null}
      </div>
    </div>
  );
}
