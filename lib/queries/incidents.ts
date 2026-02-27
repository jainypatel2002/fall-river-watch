"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type IncidentMapItem = {
  id: string;
  category: string;
  title: string | null;
  description: string;
  severity: number;
  status: string;
  lat: number;
  lng: number;
  created_at: string;
  is_anonymous: boolean;
  author_display_name: string;
  danger_radius_meters: number | null;
  danger_center_lat: number | null;
  danger_center_lng: number | null;
};

type IncidentDetail = {
  id: string;
  category: string;
  title: string | null;
  description: string;
  severity: number;
  status: string;
  lat: number;
  lng: number;
  created_at: string;
  updated_at: string;
  is_anonymous: boolean;
  author_display_name: string;
  danger_radius_meters: number | null;
  danger_center_lat: number | null;
  danger_center_lng: number | null;
  attachments: Array<{
    id: string;
    signedUrl: string;
    mime_type: string;
    byte_size: number | null;
  }>;
};

type IncidentComment = {
  id: string;
  incident_id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
  is_anonymous: boolean;
  author_display_name: string;
  replyCount?: number;
  is_owner: boolean;
  attachments: Array<{
    id: string;
    signedUrl: string;
    mime_type: string;
    byte_size: number | null;
  }>;
};

type CursorPage<T> = {
  items: T[];
  nextCursor: string | null;
};

type IncidentsMapResponse = {
  items: IncidentMapItem[];
  nextCursor: string | null;
};

type IncidentDetailResponse = {
  incident: IncidentDetail;
  commentSummary: {
    topLevelCount: number;
  };
};

type MapIncidentFilters = {
  bbox: { west: number; south: number; east: number; north: number } | null;
  categories: string[];
  timeRange: "1h" | "6h" | "24h" | "7d";
};

function serializeMapFilterKey(filters: MapIncidentFilters) {
  if (!filters.bbox) return "no-bbox";

  const fixed = (value: number) => value.toFixed(5);
  return JSON.stringify({
    bbox: {
      west: fixed(filters.bbox.west),
      south: fixed(filters.bbox.south),
      east: fixed(filters.bbox.east),
      north: fixed(filters.bbox.north)
    },
    categories: [...filters.categories].sort(),
    timeRange: filters.timeRange
  });
}

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((payload as { error?: string })?.error ?? "Request failed");
  }
  return payload as T;
}

export function useIncidentsMapQuery(filters: MapIncidentFilters) {
  const filterKey = serializeMapFilterKey(filters);

  return useQuery({
    queryKey: ["incidents-map", filterKey],
    enabled: Boolean(filters.bbox),
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams();
      params.set(
        "bbox",
        `${filters.bbox?.west ?? 0},${filters.bbox?.south ?? 0},${filters.bbox?.east ?? 0},${filters.bbox?.north ?? 0}`
      );
      params.set("limit", "500");
      params.set("timeRange", filters.timeRange);
      if (filters.categories.length) {
        params.set("categories", filters.categories.join(","));
      }

      const response = await fetch(`/api/incidents?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        signal
      });

      return parseJsonOrThrow<IncidentsMapResponse>(response);
    },
    placeholderData: (previous) => previous
  });
}

export function useIncidentDetailQuery(incidentId: string) {
  return useQuery({
    queryKey: ["incident-detail", incidentId],
    enabled: Boolean(incidentId),
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/incidents/${incidentId}`, {
        method: "GET",
        cache: "no-store",
        signal
      });

      return parseJsonOrThrow<IncidentDetailResponse>(response);
    }
  });
}

export function useIncidentCommentsQuery(incidentId: string, limit = 20) {
  return useInfiniteQuery({
    queryKey: ["incident-comments", incidentId, limit],
    enabled: Boolean(incidentId),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (pageParam) params.set("cursor", pageParam);

      const response = await fetch(`/api/incidents/${incidentId}/comments?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        signal
      });

      return parseJsonOrThrow<CursorPage<IncidentComment>>(response);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined
  });
}

export function useCommentRepliesQuery(commentId: string, limit = 20, enabled = true) {
  return useInfiniteQuery({
    queryKey: ["comment-replies", commentId, limit],
    enabled: Boolean(commentId) && enabled,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (pageParam) params.set("cursor", pageParam);

      const response = await fetch(`/api/comments/${commentId}/replies?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
        signal
      });

      return parseJsonOrThrow<CursorPage<IncidentComment>>(response);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined
  });
}

export function useCreateIncidentCommentMutation(incidentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      body: string;
      is_anonymous: boolean;
      parent_id?: string | null;
      attachmentIds?: string[];
    }) => {
      const response = await fetch(`/api/incidents/${incidentId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      return parseJsonOrThrow<{ comment: IncidentComment }>(response);
    },
    onSuccess: async (_result, variables) => {
      if (variables.parent_id) {
        await queryClient.invalidateQueries({ queryKey: ["comment-replies", variables.parent_id] });
      }
      await queryClient.invalidateQueries({ queryKey: ["incident-comments", incidentId] });
      await queryClient.invalidateQueries({ queryKey: ["incident-detail", incidentId] });
    }
  });
}

export function useDeleteCommentMutation(incidentId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commentId: string) => {
      const response = await fetch(`/api/comments/${commentId}`, {
        method: "DELETE"
      });

      return parseJsonOrThrow<{ ok: true }>(response);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["incident-comments", incidentId] });
      await queryClient.invalidateQueries({ queryKey: ["incident-detail", incidentId] });
    }
  });
}

export function useReportCommentMutation() {
  return useMutation({
    mutationFn: async ({ commentId, reason }: { commentId: string; reason?: string }) => {
      const response = await fetch(`/api/comments/${commentId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason ?? "" })
      });

      return parseJsonOrThrow<{ ok: true }>(response);
    }
  });
}

export function useEvidenceUploadInitMutation() {
  return useMutation({
    mutationFn: async (payload: {
      scope: "incident" | "comment";
      incident_id?: string;
      comment_id?: string;
      fileName: string;
      mimeType: "image/jpeg" | "image/png" | "image/webp";
      byteSize: number;
    }) => {
      const response = await fetch("/api/uploads/evidence/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      return parseJsonOrThrow<{
        attachment: {
          id: string;
          storage_bucket: string;
          storage_path: string;
          mime_type: string;
          byte_size: number;
        };
        upload: {
          signedUrl: string;
          token: string;
          path: string;
          headers: Record<string, string>;
        };
      }>(response);
    }
  });
}

export async function uploadEvidenceFileWithSignedUrl({
  scope,
  incidentId,
  commentId,
  file
}: {
  scope: "incident" | "comment";
  incidentId?: string;
  commentId?: string;
  file: File;
}) {
  const supabase = createSupabaseBrowserClient();

  const initResponse = await fetch("/api/uploads/evidence/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope,
      incident_id: incidentId,
      comment_id: commentId,
      fileName: file.name,
      mimeType: file.type,
      byteSize: file.size
    })
  });

  const initPayload = await parseJsonOrThrow<{
    attachment: { id: string };
    upload: { token: string; path: string };
  }>(initResponse);

  const { error } = await supabase.storage.from("incident-evidence").uploadToSignedUrl(initPayload.upload.path, initPayload.upload.token, file);

  if (error) {
    throw new Error(error.message);
  }

  return initPayload.attachment.id;
}

export type { IncidentMapItem, IncidentDetail, IncidentComment, MapIncidentFilters };
