import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { createIncidentCommentSchema } from "@/lib/schemas/incident";
import { decodeTimestampCursor, encodeTimestampCursor } from "@/lib/server/cursor";
import { signAttachmentUrls } from "@/lib/server/incident-attachments";
import { requireAuth } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function parseLimit(raw: string | null) {
  const parsed = Number(raw ?? 20);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();

  try {
    const url = new URL(request.url);
    const limit = parseLimit(url.searchParams.get("limit"));
    const cursorParam = url.searchParams.get("cursor");
    const cursor = decodeTimestampCursor(cursorParam);

    if (cursorParam && !cursor) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("get_incident_comments_page", {
      p_incident_id: id,
      p_limit: limit,
      p_cursor_created_at: cursor?.createdAt ?? null,
      p_cursor_id: cursor?.id ?? null
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as Array<{
      id: string;
      incident_id: string;
      parent_id: string | null;
      body: string;
      created_at: string;
      updated_at: string;
      is_anonymous: boolean;
      author_display_name: string;
      reply_count: number;
      is_owner: boolean;
    }>;

    const commentIds = rows.map((row) => row.id);

    const { data: attachmentRows, error: attachmentError } = commentIds.length
      ? await supabase
          .from("incident_attachments")
          .select("id, comment_id, storage_bucket, storage_path, mime_type, byte_size, created_at")
          .in("comment_id", commentIds)
          .order("created_at", { ascending: true })
      : { data: [], error: null };

    if (attachmentError) {
      return NextResponse.json({ error: attachmentError.message }, { status: 500 });
    }

    const signedAttachments = await signAttachmentUrls(
      supabase,
      (attachmentRows ?? []).map((row) => ({
        id: row.id,
        storage_bucket: row.storage_bucket,
        storage_path: row.storage_path,
        mime_type: row.mime_type,
        byte_size: row.byte_size
      }))
    );

    const attachmentLookup = new Map<string, typeof signedAttachments>();
    const signedById = new Map(signedAttachments.map((item) => [item.id, item]));

    for (const row of attachmentRows ?? []) {
      if (!row.comment_id) continue;
      const signed = signedById.get(row.id);
      if (!signed) continue;
      const bucket = attachmentLookup.get(row.comment_id) ?? [];
      bucket.push(signed);
      attachmentLookup.set(row.comment_id, bucket);
    }

    const items = rows.map((row) => ({
      id: row.id,
      incident_id: row.incident_id,
      parent_id: row.parent_id,
      body: row.body,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_anonymous: row.is_anonymous,
      author_display_name: row.is_anonymous ? "Anonymous" : row.author_display_name,
      replyCount: Number(row.reply_count ?? 0),
      is_owner: Boolean(row.is_owner),
      attachments: attachmentLookup.get(row.id) ?? []
    }));

    const last = rows[rows.length - 1];
    const nextCursor = rows.length === limit && last ? encodeTimestampCursor({ createdAt: last.created_at, id: last.id }) : null;

    return NextResponse.json({ items, nextCursor });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    const status = error instanceof ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { id } = await context.params;

  try {
    const body = await request.json();
    const payload = createIncidentCommentSchema.parse(body);

    const { data: incidentExists, error: incidentCheckError } = await auth.supabase.from("reports").select("id").eq("id", id).maybeSingle();

    if (incidentCheckError) {
      return NextResponse.json({ error: incidentCheckError.message }, { status: 500 });
    }

    if (!incidentExists) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    if (payload.parent_id) {
      const { data: parentComment, error: parentError } = await auth.supabase
        .from("incident_comments")
        .select("id, incident_id, parent_id")
        .eq("id", payload.parent_id)
        .maybeSingle();

      if (parentError) {
        return NextResponse.json({ error: parentError.message }, { status: 500 });
      }

      if (!parentComment) {
        return NextResponse.json({ error: "Parent comment not found" }, { status: 404 });
      }

      if (parentComment.incident_id !== id) {
        return NextResponse.json({ error: "Reply must belong to the same incident" }, { status: 400 });
      }

      if (parentComment.parent_id) {
        return NextResponse.json({ error: "Replies can only be posted to top-level comments" }, { status: 400 });
      }
    }

    const { data: insertedComment, error: insertError } = await auth.supabase
      .from("incident_comments")
      .insert({
        incident_id: id,
        user_id: auth.user.id,
        parent_id: payload.parent_id ?? null,
        body: payload.body.trim(),
        is_anonymous: payload.is_anonymous
      })
      .select("id, incident_id, parent_id, body, created_at, updated_at, is_anonymous")
      .single();

    if (insertError || !insertedComment) {
      return NextResponse.json({ error: insertError?.message ?? "Failed to create comment" }, { status: 400 });
    }

    if (payload.attachmentIds.length) {
      const { data: updatedRows, error: updateError } = await auth.supabase
        .from("incident_attachments")
        .update({ incident_id: null, comment_id: insertedComment.id })
        .eq("user_id", auth.user.id)
        .eq("incident_id", id)
        .is("comment_id", null)
        .in("id", payload.attachmentIds)
        .select("id");

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 });
      }

      if ((updatedRows ?? []).length !== payload.attachmentIds.length) {
        return NextResponse.json({ error: "Some attachments could not be attached to this comment" }, { status: 400 });
      }
    }

    const { data: profile } = await auth.supabase.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle();

    const { data: attachmentRows, error: attachmentError } = await auth.supabase
      .from("incident_attachments")
      .select("id, storage_bucket, storage_path, mime_type, byte_size")
      .eq("comment_id", insertedComment.id)
      .order("created_at", { ascending: true });

    if (attachmentError) {
      return NextResponse.json({ error: attachmentError.message }, { status: 500 });
    }

    const attachments = await signAttachmentUrls(
      auth.supabase,
      (attachmentRows ?? []).map((row) => ({
        id: row.id,
        storage_bucket: row.storage_bucket,
        storage_path: row.storage_path,
        mime_type: row.mime_type,
        byte_size: row.byte_size
      }))
    );

    return NextResponse.json(
      {
        comment: {
          id: insertedComment.id,
          incident_id: insertedComment.incident_id,
          parent_id: insertedComment.parent_id,
          body: insertedComment.body,
          created_at: insertedComment.created_at,
          updated_at: insertedComment.updated_at,
          is_anonymous: insertedComment.is_anonymous,
          author_display_name: insertedComment.is_anonymous ? "Anonymous" : profile?.display_name || "Neighbor",
          replyCount: 0,
          is_owner: true,
          attachments
        }
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    const status = error instanceof ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
