"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  applyToGigSchema,
  createGigFlagSchema,
  createGigReviewSchema,
  createGigSchema,
  sendGigMessageSchema,
  updateGigSchema,
  updateGigStatusSchema
} from "@/lib/schemas/gigs";
import { queryKeys } from "@/lib/queries/keys";
import type {
  ApplyToGigInput,
  CreateGigFlagInput,
  CreateGigInput,
  CreateGigReviewInput,
  SendGigMessageInput,
  UpdateGigInput
} from "@/lib/schemas/gigs";
import type {
  GigApplicationRecord,
  GigApplicationWithGig,
  GigCategory,
  GigChatMessageRecord,
  GigChatThreadRecord,
  GigMediaRecord,
  GigPayType,
  GigRecord,
  GigReviewRecord,
  GigStatus,
  GigWithRelations
} from "@/lib/types/gigs";

type GigFilters = {
  category: "all" | GigCategory;
  payType: "all" | GigPayType;
  status: "all" | GigStatus;
  q: string;
};

type RespondToApplicationResult = {
  thread_id: string | null;
  gig_id: string;
  assigned_user_id: string | null;
  gig_status: GigStatus;
  application_id: string;
  application_status: "accepted" | "declined";
};

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sanitizeLike(value: string) {
  return value.replace(/[%_]/g, "").trim();
}

function serializeFilters(filters: GigFilters) {
  return JSON.stringify({
    category: filters.category,
    payType: filters.payType,
    status: filters.status,
    q: filters.q.trim()
  });
}

function toGigRecord(row: Record<string, unknown>): GigRecord {
  return {
    id: String(row.id),
    creator_user_id: String(row.creator_user_id),
    title: String(row.title ?? ""),
    category: row.category as GigRecord["category"],
    description: String(row.description ?? ""),
    pay_type: row.pay_type as GigRecord["pay_type"],
    pay_amount: toNullableNumber(row.pay_amount),
    currency: String(row.currency ?? "USD"),
    is_remote: Boolean(row.is_remote),
    location_name: String(row.location_name ?? ""),
    street: row.street ? String(row.street) : null,
    city: String(row.city ?? "Fall River"),
    state: String(row.state ?? "MA"),
    zip: row.zip ? String(row.zip) : null,
    lat: toNullableNumber(row.lat),
    lng: toNullableNumber(row.lng),
    schedule_type: row.schedule_type as GigRecord["schedule_type"],
    start_at: row.start_at ? String(row.start_at) : null,
    duration_minutes: toNullableNumber(row.duration_minutes),
    people_needed: Math.max(1, Math.trunc(toNumber(row.people_needed, 1))),
    tools_required: Boolean(row.tools_required),
    tools_list: row.tools_list ? String(row.tools_list) : null,
    status: row.status as GigRecord["status"],
    assigned_user_id: row.assigned_user_id ? String(row.assigned_user_id) : null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString())
  };
}

function toGigMediaRecord(row: Record<string, unknown>): GigMediaRecord {
  return {
    id: String(row.id),
    gig_id: String(row.gig_id),
    uploader_user_id: String(row.uploader_user_id),
    storage_path: String(row.storage_path),
    public_url: String(row.public_url ?? ""),
    mime_type: String(row.mime_type),
    created_at: String(row.created_at ?? new Date().toISOString())
  };
}

function toGigApplicationRecord(row: Record<string, unknown>): GigApplicationRecord {
  return {
    id: String(row.id),
    gig_id: String(row.gig_id),
    applicant_user_id: String(row.applicant_user_id),
    message: String(row.message ?? ""),
    offered_pay_amount: toNullableNumber(row.offered_pay_amount),
    availability: row.availability ? String(row.availability) : null,
    has_tools: Boolean(row.has_tools),
    status: row.status as GigApplicationRecord["status"],
    created_at: String(row.created_at ?? new Date().toISOString())
  };
}

function toGigThreadRecord(row: Record<string, unknown>): GigChatThreadRecord {
  return {
    id: String(row.id),
    gig_id: String(row.gig_id),
    creator_user_id: String(row.creator_user_id),
    worker_user_id: String(row.worker_user_id),
    created_at: String(row.created_at ?? new Date().toISOString())
  };
}

function toGigMessageRecord(row: Record<string, unknown>): GigChatMessageRecord {
  return {
    id: String(row.id),
    thread_id: String(row.thread_id),
    sender_user_id: String(row.sender_user_id),
    message: String(row.message ?? ""),
    created_at: String(row.created_at ?? new Date().toISOString())
  };
}

function toGigReviewRecord(row: Record<string, unknown>): GigReviewRecord {
  return {
    id: String(row.id),
    gig_id: String(row.gig_id),
    reviewer_user_id: String(row.reviewer_user_id),
    reviewee_user_id: String(row.reviewee_user_id),
    rating: Number(row.rating) === -1 ? -1 : 1,
    comment: row.comment ? String(row.comment) : null,
    created_at: String(row.created_at ?? new Date().toISOString())
  };
}

async function listGigs(filters: GigFilters): Promise<GigRecord[]> {
  const supabase = createSupabaseBrowserClient();
  let query = supabase.from("gigs").select("*").order("created_at", { ascending: false }).limit(200);

  if (filters.category !== "all") {
    query = query.eq("category", filters.category);
  }

  if (filters.payType !== "all") {
    query = query.eq("pay_type", filters.payType);
  }

  if (filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  const search = sanitizeLike(filters.q);
  if (search.length) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => toGigRecord(row));
}

async function getGigDetail(gigId: string, userId: string | null): Promise<GigWithRelations | null> {
  const supabase = createSupabaseBrowserClient();

  const { data: gigRow, error: gigError } = await supabase.from("gigs").select("*").eq("id", gigId).maybeSingle();
  if (gigError) throw new Error(gigError.message);
  if (!gigRow) return null;

  const [mediaResult, applicationsResult, reviewsResult, myApplicationResult, threadResult] = await Promise.all([
    supabase.from("gig_media").select("*").eq("gig_id", gigId).order("created_at", { ascending: true }),
    supabase.from("gig_applications").select("*").eq("gig_id", gigId).order("created_at", { ascending: false }),
    supabase.from("gig_reviews").select("*").eq("gig_id", gigId).order("created_at", { ascending: false }),
    userId
      ? supabase
          .from("gig_applications")
          .select("*")
          .eq("gig_id", gigId)
          .eq("applicant_user_id", userId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    userId
      ? supabase
          .from("gig_chat_threads")
          .select("*")
          .eq("gig_id", gigId)
          .or(`creator_user_id.eq.${userId},worker_user_id.eq.${userId}`)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  if (mediaResult.error) throw new Error(mediaResult.error.message);
  if (applicationsResult.error) throw new Error(applicationsResult.error.message);
  if (reviewsResult.error) throw new Error(reviewsResult.error.message);
  if (myApplicationResult.error) throw new Error(myApplicationResult.error.message);
  if (threadResult.error) throw new Error(threadResult.error.message);

  return {
    gig: toGigRecord(gigRow),
    media: (mediaResult.data ?? []).map((row: Record<string, unknown>) => toGigMediaRecord(row)),
    applications: (applicationsResult.data ?? []).map((row: Record<string, unknown>) => toGigApplicationRecord(row)),
    myApplication: myApplicationResult.data ? toGigApplicationRecord(myApplicationResult.data) : null,
    chatThread: threadResult.data ? toGigThreadRecord(threadResult.data) : null,
    reviews: (reviewsResult.data ?? []).map((row: Record<string, unknown>) => toGigReviewRecord(row))
  };
}

async function listMyGigPosts(userId: string): Promise<GigRecord[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("gigs")
    .select("*")
    .eq("creator_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => toGigRecord(row));
}

async function listMyGigApplications(userId: string): Promise<GigApplicationWithGig[]> {
  const supabase = createSupabaseBrowserClient();
  const { data: applicationRows, error: applicationError } = await supabase
    .from("gig_applications")
    .select("*")
    .eq("applicant_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (applicationError) throw new Error(applicationError.message);

  const applications = (applicationRows ?? []).map((row: Record<string, unknown>) => toGigApplicationRecord(row));
  const gigIds = [...new Set(applications.map((item: GigApplicationRecord) => item.gig_id))];

  if (!gigIds.length) return [];

  const { data: gigRows, error: gigError } = await supabase.from("gigs").select("*").in("id", gigIds);
  if (gigError) throw new Error(gigError.message);

  const gigsById = new Map((gigRows ?? []).map((row: Record<string, unknown>) => [String(row.id), toGigRecord(row)]));
  return applications.map((application: GigApplicationRecord) => ({
    application,
    gig: gigsById.get(application.gig_id) ?? null
  }));
}

async function createGig(payload: CreateGigInput): Promise<GigRecord> {
  const supabase = createSupabaseBrowserClient();
  const validated = createGigSchema.parse(payload);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Unauthorized");
  }

  const { data, error } = await supabase
    .from("gigs")
    .insert({
      ...validated,
      creator_user_id: user.id,
      pay_amount: validated.pay_type === "free" ? null : validated.pay_amount ?? null
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to create gig");
  }

  return toGigRecord(data);
}

async function updateGig(gigId: string, payload: UpdateGigInput): Promise<GigRecord> {
  const supabase = createSupabaseBrowserClient();
  const validated = updateGigSchema.parse(payload);
  const patch: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(validated)) {
    if (typeof value !== "undefined") {
      patch[key] = value;
    }
  }

  if (patch.pay_type === "free") {
    patch.pay_amount = null;
  }

  const { data, error } = await supabase.from("gigs").update(patch).eq("id", gigId).select("*").maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Gig not found");
  return toGigRecord(data);
}

async function deleteGig(gigId: string) {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.from("gigs").delete().eq("id", gigId);
  if (error) throw new Error(error.message);
}

async function applyToGig(gigId: string, payload: ApplyToGigInput): Promise<GigApplicationRecord> {
  const supabase = createSupabaseBrowserClient();
  const validated = applyToGigSchema.parse(payload);
  const { data, error } = await supabase.rpc("apply_to_gig", {
    p_gig_id: gigId,
    p_message: validated.message,
    p_offered_pay: validated.offered_pay_amount ?? null,
    p_availability: validated.availability ?? null,
    p_has_tools: validated.has_tools
  });

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to apply");
  }

  return toGigApplicationRecord(data);
}

async function respondToGigApplication(applicationId: string, decision: "accept" | "decline"): Promise<RespondToApplicationResult> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("respond_to_application", {
    p_application_id: applicationId,
    p_decision: decision
  });

  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("Failed to update application");

  return {
    thread_id: row.thread_id ? String(row.thread_id) : null,
    gig_id: String(row.gig_id),
    assigned_user_id: row.assigned_user_id ? String(row.assigned_user_id) : null,
    gig_status: row.gig_status as GigStatus,
    application_id: String(row.application_id),
    application_status: row.application_status as "accepted" | "declined"
  };
}

async function updateGigStatus(gigId: string, status: "open" | "assigned" | "in_progress" | "completed" | "canceled"): Promise<GigRecord> {
  const supabase = createSupabaseBrowserClient();
  const validated = updateGigStatusSchema.parse({ status });
  const { data, error } = await supabase.rpc("update_gig_status", {
    p_gig_id: gigId,
    p_status: validated.status
  });

  if (error || !data) throw new Error(error?.message ?? "Failed to update status");
  return toGigRecord(data);
}

async function createGigReview(gigId: string, revieweeUserId: string, payload: CreateGigReviewInput): Promise<GigReviewRecord> {
  const supabase = createSupabaseBrowserClient();
  const validated = createGigReviewSchema.parse(payload);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("gig_reviews")
    .insert({
      gig_id: gigId,
      reviewer_user_id: user.id,
      reviewee_user_id: revieweeUserId,
      rating: validated.rating,
      comment: validated.comment?.trim() ? validated.comment.trim() : null
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to submit review");
  return toGigReviewRecord(data);
}

async function createGigFlag(gigId: string, payload: CreateGigFlagInput) {
  const supabase = createSupabaseBrowserClient();
  const validated = createGigFlagSchema.parse(payload);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const { error } = await supabase.from("gig_flags").insert({
    gig_id: gigId,
    reporter_user_id: user.id,
    reason: validated.reason,
    details: validated.details?.trim() ? validated.details.trim() : null
  });

  if (error) throw new Error(error.message);
}

async function upsertGigMedia(gigId: string, rows: Array<{ storage_path: string; mime_type: string; public_url?: string }>) {
  const supabase = createSupabaseBrowserClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");
  if (!rows.length) return [] as GigMediaRecord[];

  const payload = rows.map((item) => ({
    gig_id: gigId,
    uploader_user_id: user.id,
    storage_path: item.storage_path,
    public_url: item.public_url ?? item.storage_path,
    mime_type: item.mime_type
  }));

  const { data, error } = await supabase.from("gig_media").insert(payload).select("*");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => toGigMediaRecord(row));
}

async function removeGigMedia(mediaId: string, gigId: string) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("gig_media").delete().eq("id", mediaId).eq("gig_id", gigId).select("*").maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toGigMediaRecord(data) : null;
}

async function getGigChatThread(threadId: string): Promise<GigChatThreadRecord | null> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.from("gig_chat_threads").select("*").eq("id", threadId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toGigThreadRecord(data) : null;
}

async function listGigChatMessages(threadId: string): Promise<GigChatMessageRecord[]> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("gig_chat_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) throw new Error(error.message);
  return (data ?? []).map((row: Record<string, unknown>) => toGigMessageRecord(row));
}

async function sendGigChatMessage(threadId: string, payload: SendGigMessageInput): Promise<GigChatMessageRecord> {
  const supabase = createSupabaseBrowserClient();
  const validated = sendGigMessageSchema.parse(payload);
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Unauthorized");

  const { data, error } = await supabase
    .from("gig_chat_messages")
    .insert({
      thread_id: threadId,
      sender_user_id: user.id,
      message: validated.message
    })
    .select("*")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to send message");
  return toGigMessageRecord(data);
}

export async function getGigMediaSignedUrl(path: string): Promise<string> {
  const response = await fetch(`/api/gigs/media-url?path=${encodeURIComponent(path)}`, {
    method: "GET",
    cache: "no-store"
  });

  const body = (await response.json().catch(() => null)) as { signedUrl?: string; error?: string } | null;
  if (!response.ok || !body?.signedUrl) {
    throw new Error(body?.error ?? "Failed to load media");
  }
  return body.signedUrl;
}

export function useGigsQuery(filters: GigFilters) {
  const key = serializeFilters(filters);
  return useQuery({
    queryKey: queryKeys.gigs(key),
    queryFn: () => listGigs(filters),
    placeholderData: (previous) => previous
  });
}

export function useGigDetailQuery(gigId: string, userId: string | null) {
  return useQuery({
    queryKey: [...queryKeys.gigDetail(gigId), userId ?? "anon"],
    queryFn: () => getGigDetail(gigId, userId),
    enabled: Boolean(gigId)
  });
}

export function useMyGigPostsQuery(userId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.gigPosts(userId ?? "anonymous"),
    queryFn: () => listMyGigPosts(userId as string),
    enabled: Boolean(userId) && enabled
  });
}

export function useMyGigApplicationsQuery(userId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.gigApplications(userId ?? "anonymous"),
    queryFn: () => listMyGigApplications(userId as string),
    enabled: Boolean(userId) && enabled
  });
}

export function useCreateGigMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateGigInput) => createGig(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["gigs"] });
      await queryClient.invalidateQueries({ queryKey: ["gig-posts"] });
    }
  });
}

export function useUpdateGigMutation(gigId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateGigInput) => updateGig(gigId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.gigDetail(gigId) });
      await queryClient.invalidateQueries({ queryKey: ["gigs"] });
      await queryClient.invalidateQueries({ queryKey: ["gig-posts"] });
      await queryClient.invalidateQueries({ queryKey: ["gig-applications"] });
    }
  });
}

export function useDeleteGigMutation(gigId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteGig(gigId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["gigs"] });
      await queryClient.invalidateQueries({ queryKey: queryKeys.gigDetail(gigId) });
      await queryClient.invalidateQueries({ queryKey: ["gig-posts"] });
    }
  });
}

export function useApplyToGigMutation(gigId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ApplyToGigInput) => applyToGig(gigId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.gigDetail(gigId) });
      await queryClient.invalidateQueries({ queryKey: ["gig-applications"] });
    }
  });
}

export function useRespondToGigApplicationMutation(gigId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ applicationId, decision }: { applicationId: string; decision: "accept" | "decline" }) =>
      respondToGigApplication(applicationId, decision),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.gigDetail(gigId) });
      await queryClient.invalidateQueries({ queryKey: ["gigs"] });
      await queryClient.invalidateQueries({ queryKey: ["gig-applications"] });
    }
  });
}

export function useUpdateGigStatusMutation(gigId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: "open" | "assigned" | "in_progress" | "completed" | "canceled") => updateGigStatus(gigId, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.gigDetail(gigId) });
      await queryClient.invalidateQueries({ queryKey: ["gigs"] });
      await queryClient.invalidateQueries({ queryKey: ["gig-posts"] });
      await queryClient.invalidateQueries({ queryKey: ["gig-applications"] });
    }
  });
}

export function useCreateGigReviewMutation(gigId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ revieweeUserId, payload }: { revieweeUserId: string; payload: CreateGigReviewInput }) =>
      createGigReview(gigId, revieweeUserId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.gigDetail(gigId) });
    }
  });
}

export function useCreateGigFlagMutation(gigId: string) {
  return useMutation({
    mutationFn: (payload: CreateGigFlagInput) => createGigFlag(gigId, payload)
  });
}

export function useUpsertGigMediaMutation(gigId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rows: Array<{ storage_path: string; mime_type: string; public_url?: string }>) => upsertGigMedia(gigId, rows),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.gigDetail(gigId) });
    }
  });
}

export function useRemoveGigMediaMutation(gigId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mediaId: string) => removeGigMedia(mediaId, gigId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.gigDetail(gigId) });
    }
  });
}

export function useGigChatThreadQuery(threadId: string) {
  return useQuery({
    queryKey: queryKeys.gigChatThread(threadId),
    queryFn: () => getGigChatThread(threadId),
    enabled: Boolean(threadId)
  });
}

export function useGigChatMessagesQuery(threadId: string) {
  return useQuery({
    queryKey: queryKeys.gigChatMessages(threadId),
    queryFn: () => listGigChatMessages(threadId),
    enabled: Boolean(threadId)
  });
}

export function useSendGigChatMessageMutation(threadId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SendGigMessageInput) => sendGigChatMessage(threadId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.gigChatMessages(threadId) });
    }
  });
}
