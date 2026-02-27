"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queries/keys";
import { jsonFetch } from "@/lib/queries/fetcher";
import type { CreateReportInput, NotificationSettingsInput, ReportFiltersInput } from "@/lib/schemas/report";
import type { IncidentCategory, IncidentStatus } from "@/lib/types";

type ReportsResponse = {
  reports: Array<{
    id: string;
    reporter_id: string;
    category: IncidentCategory;
    title: string | null;
    description: string;
    severity: number;
    status: IncidentStatus;
    created_at: string;
    expires_at: string;
    display_lat: number;
    display_lng: number;
    distance_meters: number | null;
    confirms: number;
    disputes: number;
    media: Array<{ id: string; storage_path: string; media_type: "image" }>;
  }>;
  fallbackUsed?: boolean;
};

type ReportDetailResponse = {
  report: ReportsResponse["reports"][number] & {
    user_vote: "confirm" | "dispute" | null;
    is_owner: boolean;
    can_resolve: boolean;
  };
};

export function filtersToKey(filters: ReportFiltersInput) {
  return JSON.stringify(filters);
}

export function useReportsQuery(filters: ReportFiltersInput) {
  const filtersKey = filtersToKey(filters);

  return useQuery({
    queryKey: queryKeys.reports(filtersKey),
    queryFn: () =>
      jsonFetch<ReportsResponse>("/api/reports/query", {
        method: "POST",
        body: JSON.stringify(filters),
        cache: "no-store"
      })
  });
}

export function useReportDetailQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.reportDetail(id),
    queryFn: () => jsonFetch<ReportDetailResponse>(`/api/reports/${id}`, { cache: "no-store" }),
    enabled: Boolean(id)
  });
}

export function useCreateReportMutation() {
  return useMutation({
    mutationFn: (payload: CreateReportInput) =>
      jsonFetch<{ id: string }>("/api/reports", {
        method: "POST",
        body: JSON.stringify(payload)
      })
  });
}

export function useVoteMutation(reportId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (voteType: "confirm" | "dispute") =>
      jsonFetch<{ ok: true }>(`/api/reports/${reportId}/vote`, {
        method: "POST",
        body: JSON.stringify({ voteType })
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reportDetail(reportId) });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    }
  });
}

export function useResolveMutation(reportId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      jsonFetch<{ ok: true }>(`/api/reports/${reportId}/resolve`, {
        method: "POST"
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reportDetail(reportId) });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    }
  });
}

export function useAdminReportsQuery({ search, status, category }: { search: string; status: string; category: string }) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (status) params.set("status", status);
  if (category) params.set("category", category);

  return useQuery({
    queryKey: queryKeys.adminReports(search, status, category),
    queryFn: () => jsonFetch<{ reports: Array<{ id: string; title: string | null; description: string; status: IncidentStatus; category: string; created_at: string; severity: number }> }>(`/api/admin/reports?${params.toString()}`)
  });
}

export function useAdminReportStatusMutation(reportId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (status: "verified" | "disputed" | "resolved" | "expired") =>
      jsonFetch<{ ok: true }>(`/api/admin/reports/${reportId}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    }
  });
}

export function useAdminDeleteReportMutation(reportId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      jsonFetch<{ ok: true }>(`/api/admin/reports/${reportId}`, {
        method: "DELETE"
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
    }
  });
}

export function useNotificationSettingsQuery() {
  return useQuery({
    queryKey: queryKeys.notificationSettings,
    queryFn: () => jsonFetch<{ settings: NotificationSettingsInput | null }>("/api/settings/notifications")
  });
}

export function useNotificationSettingsMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: NotificationSettingsInput) =>
      jsonFetch<{ ok: true }>("/api/settings/notifications", {
        method: "PUT",
        body: JSON.stringify(payload)
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.notificationSettings });
    }
  });
}
