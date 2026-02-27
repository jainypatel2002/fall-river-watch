import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { evidenceUploadInitSchema } from "@/lib/schemas/incident";
import { buildEvidenceStoragePath } from "@/lib/server/incident-attachments";
import { requireAuth } from "@/lib/supabase/auth";

const EVIDENCE_BUCKET = "incident-evidence";

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const payload = evidenceUploadInitSchema.parse(body);

    if (payload.scope === "incident") {
      const { data: incident, error: incidentError } = await auth.supabase
        .from("reports")
        .select("id")
        .eq("id", payload.incident_id as string)
        .maybeSingle();

      if (incidentError) {
        return NextResponse.json({ error: incidentError.message }, { status: 500 });
      }

      if (!incident) {
        return NextResponse.json({ error: "Incident not found" }, { status: 404 });
      }
    }

    if (payload.scope === "comment") {
      const { data: comment, error: commentError } = await auth.supabase
        .from("incident_comments")
        .select("id, user_id")
        .eq("id", payload.comment_id as string)
        .maybeSingle();

      if (commentError) {
        return NextResponse.json({ error: commentError.message }, { status: 500 });
      }

      if (!comment) {
        return NextResponse.json({ error: "Comment not found" }, { status: 404 });
      }

      if (comment.user_id !== auth.user.id) {
        return NextResponse.json({ error: "Only the comment owner can attach evidence directly to a comment" }, { status: 403 });
      }
    }

    const targetId = payload.scope === "incident" ? (payload.incident_id as string) : (payload.comment_id as string);
    const storagePath = buildEvidenceStoragePath({
      userId: auth.user.id,
      scope: payload.scope,
      targetId,
      fileName: payload.fileName
    });

    const { data: attachment, error: attachmentError } = await auth.supabase
      .from("incident_attachments")
      .insert({
        incident_id: payload.scope === "incident" ? payload.incident_id : null,
        comment_id: payload.scope === "comment" ? payload.comment_id : null,
        user_id: auth.user.id,
        storage_bucket: EVIDENCE_BUCKET,
        storage_path: storagePath,
        mime_type: payload.mimeType,
        byte_size: payload.byteSize
      })
      .select("id, incident_id, comment_id, user_id, storage_bucket, storage_path, mime_type, byte_size, created_at")
      .single();

    if (attachmentError || !attachment) {
      return NextResponse.json({ error: attachmentError?.message ?? "Failed to initialize upload" }, { status: 400 });
    }

    const { data: signedUpload, error: signedError } = await auth.supabase.storage.from(EVIDENCE_BUCKET).createSignedUploadUrl(storagePath);

    if (signedError || !signedUpload) {
      await auth.supabase.from("incident_attachments").delete().eq("id", attachment.id).eq("user_id", auth.user.id);
      return NextResponse.json({ error: signedError?.message ?? "Failed to create signed upload URL" }, { status: 500 });
    }

    return NextResponse.json({
      attachment,
      upload: {
        signedUrl: signedUpload.signedUrl,
        token: signedUpload.token,
        path: signedUpload.path,
        headers: {
          "content-type": payload.mimeType,
          "x-upsert": "false"
        }
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    const status = error instanceof ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
