import { NextResponse } from "next/server";
import { decodeTimestampCursor, encodeTimestampCursor } from "@/lib/server/cursor";
import { signAttachmentUrls } from "@/lib/server/incident-attachments";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function parseLimit(raw: string | null) {
  const parsed = Number(raw ?? 20);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createSupabaseServerClient();

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get("limit"));
  const cursorParam = url.searchParams.get("cursor");
  const cursor = decodeTimestampCursor(cursorParam);

  if (cursorParam && !cursor) {
    return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("get_comment_replies_page", {
    p_parent_id: id,
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
    parent_id: string;
    body: string;
    created_at: string;
    updated_at: string;
    is_anonymous: boolean;
    author_display_name: string;
    is_owner: boolean;
  }>;

  const replyIds = rows.map((row) => row.id);
  const { data: attachmentRows, error: attachmentError } = replyIds.length
    ? await supabase
        .from("incident_attachments")
        .select("id, comment_id, storage_bucket, storage_path, mime_type, byte_size, created_at")
        .in("comment_id", replyIds)
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
    is_owner: Boolean(row.is_owner),
    attachments: attachmentLookup.get(row.id) ?? []
  }));

  const last = rows[rows.length - 1];
  const nextCursor = rows.length === limit && last ? encodeTimestampCursor({ createdAt: last.created_at, id: last.id }) : null;

  return NextResponse.json({ items, nextCursor });
}
