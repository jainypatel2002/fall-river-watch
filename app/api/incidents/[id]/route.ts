import { NextResponse } from "next/server";
import { signAttachmentUrls } from "@/lib/server/incident-attachments";
import { deleteReportWithCleanup } from "@/lib/server/report-delete";
import { isAdmin } from "@/lib/server/roles";
import { requireAuth } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();

  const { data: detailRows, error: detailError } = await supabase.rpc("get_incident_detail", {
    p_incident_id: id
  });

  if (detailError) {
    return NextResponse.json({ error: detailError.message }, { status: 500 });
  }

  if (!detailRows?.length) {
    return NextResponse.json({ error: "Incident not found" }, { status: 404 });
  }

  const detail = detailRows[0] as {
    id: string;
    category: string;
    title: string | null;
    description: string;
    severity: number;
    status: string;
    created_at: string;
    updated_at: string;
    lat: number;
    lng: number;
    is_anonymous: boolean;
    author_display_name: string;
    danger_radius_meters: number | null;
    danger_center_lat: number | null;
    danger_center_lng: number | null;
    top_level_comment_count: number;
  };

  const [{ data: evidenceRows, error: evidenceError }, { data: legacyMediaRows, error: legacyMediaError }] = await Promise.all([
    supabase
      .from("incident_attachments")
      .select("id, storage_bucket, storage_path, mime_type, byte_size, created_at")
      .eq("incident_id", id)
      .is("comment_id", null)
      .order("created_at", { ascending: true }),
    supabase.from("report_media").select("id, storage_path, media_type, created_at").eq("report_id", id).order("created_at", { ascending: true })
  ]);

  if (evidenceError || legacyMediaError) {
    return NextResponse.json({ error: evidenceError?.message ?? legacyMediaError?.message ?? "Failed to load attachments" }, { status: 500 });
  }

  const signedEvidence = await signAttachmentUrls(
    supabase,
    (evidenceRows ?? []).map((row) => ({
      id: row.id,
      storage_bucket: row.storage_bucket,
      storage_path: row.storage_path,
      mime_type: row.mime_type,
      byte_size: row.byte_size
    }))
  );

  const legacyEvidence = (legacyMediaRows ?? []).map((row) => {
    const url = supabase.storage.from("report-media").getPublicUrl(row.storage_path).data.publicUrl;
    return {
      id: row.id,
      signedUrl: url,
      mime_type: "image/*",
      byte_size: null as number | null
    };
  });

  return NextResponse.json({
    incident: {
      id: detail.id,
      category: detail.category,
      title: detail.title,
      description: detail.description,
      severity: detail.severity,
      status: detail.status,
      lat: detail.lat,
      lng: detail.lng,
      created_at: detail.created_at,
      updated_at: detail.updated_at,
      is_anonymous: detail.is_anonymous,
      author_display_name: detail.is_anonymous ? "Anonymous" : detail.author_display_name,
      danger_radius_meters: detail.danger_radius_meters,
      danger_center_lat: detail.danger_center_lat,
      danger_center_lng: detail.danger_center_lng,
      attachments: [...legacyEvidence, ...signedEvidence]
    },
    commentSummary: {
      topLevelCount: Number(detail.top_level_comment_count ?? 0)
    }
  });
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    const { data: report, error: reportError } = await auth.supabase
      .from("reports")
      .select("id, reporter_id")
      .eq("id", id)
      .maybeSingle();

    if (reportError) {
      return NextResponse.json({ error: reportError.message }, { status: 500 });
    }

    if (!report) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    const userIsAdmin = await isAdmin(auth.supabase, auth.user.id);
    const isOwner = report.reporter_id === auth.user.id;
    if (!isOwner && !userIsAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const result = await deleteReportWithCleanup(auth.supabase, id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ ok: true, warning: result.warning }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
