"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  const updateStatus = useAdminReportStatusMutation(report.id);
  const deleteReport = useAdminDeleteReportMutation(report.id);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">{report.title || "Untitled report"}</h3>
            <p className="text-xs text-zinc-600">
              {prettyCategory(report.category)} • severity {report.severity}
            </p>
          </div>
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs capitalize">{report.status}</span>
        </div>

        <p className="line-clamp-2 text-sm text-zinc-700">{report.description}</p>

        <div className="flex flex-wrap gap-2">
          <Select
            onValueChange={async (value) => {
              try {
                await updateStatus.mutateAsync(value as "verified" | "disputed" | "resolved" | "expired");
                toast.success("Status updated");
              } catch (error) {
                toast.error((error as Error).message);
              }
            }}
          >
            <SelectTrigger className="w-[180px]">
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
              <Button variant="destructive">Delete</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete report?</DialogTitle>
                <DialogDescription>This action cannot be undone.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="destructive"
                  onClick={async () => {
                    try {
                      await deleteReport.mutateAsync();
                      toast.success("Report deleted");
                    } catch (error) {
                      toast.error((error as Error).message);
                    }
                  }}
                >
                  Confirm delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
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
      <div className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 sm:grid-cols-3">
        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title/description" />
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

      {reportsQuery.isLoading ? <div className="h-24 animate-pulse rounded-lg bg-zinc-200" /> : null}
      {reportsQuery.error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{(reportsQuery.error as Error).message}</p>
      ) : null}

      <div className="space-y-3">
        {(reportsQuery.data?.reports ?? []).map((report) => (
          <AdminRow key={report.id} report={report} />
        ))}
      </div>
    </div>
  );
}
