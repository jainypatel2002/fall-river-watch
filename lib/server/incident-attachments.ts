import type { SupabaseClient } from "@supabase/supabase-js";

type StorageClient = Pick<SupabaseClient, "storage">;

export type IncidentAttachmentRow = {
  id: string;
  incident_id: string | null;
  comment_id: string | null;
  storage_bucket: string;
  storage_path: string;
  mime_type: string;
  byte_size: number;
};

export function sanitizeEvidenceFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120);
}

export function buildEvidenceStoragePath({
  userId,
  scope,
  targetId,
  fileName
}: {
  userId: string;
  scope: "incident" | "comment";
  targetId: string;
  fileName: string;
}) {
  const safeFileName = sanitizeEvidenceFileName(fileName);
  return `${userId}/${scope}/${targetId}/${Date.now()}-${safeFileName}`;
}

export async function signAttachmentUrl(
  supabase: StorageClient,
  row: Pick<IncidentAttachmentRow, "id" | "storage_bucket" | "storage_path" | "mime_type" | "byte_size">,
  expiresInSeconds = 600
) {
  const { data, error } = await supabase.storage.from(row.storage_bucket).createSignedUrl(row.storage_path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    return null;
  }

  return {
    id: row.id,
    signedUrl: data.signedUrl,
    mime_type: row.mime_type,
    byte_size: row.byte_size
  };
}

export async function signAttachmentUrls(
  supabase: StorageClient,
  rows: Array<Pick<IncidentAttachmentRow, "id" | "storage_bucket" | "storage_path" | "mime_type" | "byte_size">>,
  expiresInSeconds = 600
) {
  const signed = await Promise.all(rows.map((row) => signAttachmentUrl(supabase, row, expiresInSeconds)));
  return signed.filter((item): item is NonNullable<typeof item> => item !== null);
}
