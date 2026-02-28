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

type DeleteReportResponse = {
  ok: true;
  warning?: string;
};

type VoteStatus = "confirm" | "dispute" | null;

type VoteMutationResponse = {
  ok: true;
  vote: {
    confirms: number;
    disputes: number;
    user_vote: "confirm" | "dispute" | null;
  };
};

type IncidentVoteItem = {
  id: string;
  confirms: number;
  disputes: number;
  user_vote: "confirm" | "dispute" | null;
  [key: string]: unknown;
};

type IncidentsMapCache = {
  items: IncidentVoteItem[];
  nextCursor: string | null;
};

export type ApiRequestError = Error & {
  status?: number;
  endpoint?: string;
  responseBody?: string;
};

async function fetchReportDetail(reportId: string, signal?: AbortSignal) {
  const endpoint = `/api/reports/${reportId}`;
  const response = await fetch(endpoint, {
    method: "GET",
    cache: "no-store",
    signal
  });

  const rawBody = await response.text();
  let payload: any = {};
  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    payload = {};
  }

  if (!response.ok) {
    if (process.env.NODE_ENV === "development") {
      console.error("[report-detail diagnostic]", {
        reportId,
        endpoint,
        statusCode: response.status,
        responseBody: rawBody
      });
    }

    const message = payload?.error ?? (response.status === 403 ? "Forbidden" : "Request failed");
    const error = new Error(message) as ApiRequestError;
    error.status = response.status;
    error.endpoint = endpoint;
    error.responseBody = rawBody;
    throw error;
  }

  return payload as ReportDetailResponse;
}

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
      }),
    placeholderData: (previous) => previous
  });
}

export function useReportDetailQuery(id: string) {
  return useQuery({
    queryKey: queryKeys.reportDetail(id),
    queryFn: ({ signal }) => fetchReportDetail(id, signal),
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

  function getOptimisticVoteSnapshot(
    current: { confirms: number; disputes: number; user_vote: "confirm" | "dispute" | null },
    nextVote: VoteStatus
  ) {
    const confirms = current.confirms;
    const disputes = current.disputes;
    const previous = current.user_vote;

    let nextConfirms = confirms;
    let nextDisputes = disputes;

    if (previous === "confirm") nextConfirms = Math.max(0, nextConfirms - 1);
    if (previous === "dispute") nextDisputes = Math.max(0, nextDisputes - 1);

    if (nextVote === "confirm") nextConfirms += 1;
    if (nextVote === "dispute") nextDisputes += 1;

    return {
      confirms: nextConfirms,
      disputes: nextDisputes,
      user_vote: nextVote
    };
  }

  return useMutation({
    mutationFn: (status: VoteStatus) =>
      jsonFetch<VoteMutationResponse>(`/api/reports/${reportId}/vote`, {
        method: "POST",
        body: JSON.stringify({ status })
      }),
    onMutate: async (status) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.reportDetail(reportId) });
      await queryClient.cancelQueries({ queryKey: ["incidents-map"] });

      const previous = queryClient.getQueryData<ReportDetailResponse | undefined>(queryKeys.reportDetail(reportId));
      const previousIncidents = queryClient.getQueriesData<IncidentsMapCache>({
        queryKey: ["incidents-map"]
      });

      if (previous) {
        const optimistic = getOptimisticVoteSnapshot(previous.report, status);
        queryClient.setQueryData<ReportDetailResponse>(queryKeys.reportDetail(reportId), {
          ...previous,
          report: {
            ...previous.report,
            confirms: optimistic.confirms,
            disputes: optimistic.disputes,
            user_vote: optimistic.user_vote
          }
        });
      }

      for (const [queryKey, incidentData] of previousIncidents) {
        if (!incidentData) continue;

        const nextItems = incidentData.items.map((item) => {
          if (item.id !== reportId) return item;
          const optimistic = getOptimisticVoteSnapshot(
            {
              confirms: Number(item.confirms ?? 0),
              disputes: Number(item.disputes ?? 0),
              user_vote: item.user_vote ?? null
            },
            status
          );
          return {
            ...item,
            confirms: optimistic.confirms,
            disputes: optimistic.disputes,
            user_vote: optimistic.user_vote
          };
        });

        queryClient.setQueryData(queryKey, {
          ...incidentData,
          items: nextItems
        });
      }

      return { previous, previousIncidents };
    },
    onError: (_error, _status, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.reportDetail(reportId), context.previous);
      }
      for (const [queryKey, snapshot] of context?.previousIncidents ?? []) {
        queryClient.setQueryData(queryKey, snapshot);
      }
    },
    onSuccess: (result) => {
      queryClient.setQueryData<ReportDetailResponse | undefined>(queryKeys.reportDetail(reportId), (current) => {
        if (!current) return current;

        return {
          ...current,
          report: {
            ...current.report,
            confirms: result.vote.confirms,
            disputes: result.vote.disputes,
            user_vote: result.vote.user_vote
          }
        };
      });

      const incidentQueries = queryClient.getQueriesData<IncidentsMapCache>({
        queryKey: ["incidents-map"]
      });

      for (const [queryKey, incidentData] of incidentQueries) {
        if (!incidentData) continue;
        queryClient.setQueryData(queryKey, {
          ...incidentData,
          items: incidentData.items.map((item) =>
            item.id === reportId
              ? {
                  ...item,
                  confirms: result.vote.confirms,
                  disputes: result.vote.disputes,
                  user_vote: result.vote.user_vote
                }
              : item
          )
        });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reportDetail(reportId) });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
      void queryClient.invalidateQueries({ queryKey: ["incidents-map"] });
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

export function useDeleteReportMutation(reportId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      jsonFetch<DeleteReportResponse>(`/api/reports/${reportId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.reportDetail(reportId) });
      void queryClient.invalidateQueries({ queryKey: ["reports"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-reports"] });
      void queryClient.invalidateQueries({ queryKey: ["incidents-map"] });
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
