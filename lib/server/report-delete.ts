import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const deleteReportRpcRowSchema = z.object({
  deleted: z.boolean(),
  report_id: z.string().uuid(),
  media_paths: z.array(z.string()).nullable().optional()
});

type DeleteReportWithCleanupResult =
  | { ok: true; warning?: string }
  | { ok: false; status: number; error: string };

export async function deleteReportWithCleanup(
  supabase: Pick<SupabaseClient, "rpc">,
  reportId: string
): Promise<DeleteReportWithCleanupResult> {
  const { data, error } = await supabase.rpc("delete_report", { p_report_id: reportId });

  if (error) {
    if (error.message === "Unauthorized") {
      return { ok: false, status: 401, error: error.message };
    }

    if (error.message === "Forbidden") {
      return { ok: false, status: 403, error: error.message };
    }

    if (error.message === "Report not found" || error.code === "P0002") {
      return { ok: false, status: 404, error: "Report not found" };
    }

    return { ok: false, status: 500, error: error.message };
  }

  const parsedRow = deleteReportRpcRowSchema.safeParse(Array.isArray(data) ? data[0] : data);
  if (!parsedRow.success) {
    return { ok: false, status: 500, error: "Delete operation returned an unexpected response." };
  }

  const row = parsedRow.data;
  if (!row.deleted) {
    return { ok: false, status: 404, error: "Report not found or already deleted" };
  }

  const mediaPaths = (row.media_paths ?? []).filter((path) => path.length > 0);
  if (!mediaPaths.length) {
    return { ok: true };
  }

  try {
    const adminSupabase = createSupabaseAdminClient();
    const { error: storageError } = await adminSupabase.storage.from("report-media").remove(mediaPaths);

    if (storageError) {
      console.error("report media storage cleanup failed", storageError.message);
      return {
        ok: true,
        warning: "Report deleted, but media cleanup may still be in progress."
      };
    }
  } catch (error) {
    console.error("report media storage cleanup unavailable", error);
    return {
      ok: true,
      warning: "Report deleted, but media cleanup could not be completed immediately."
    };
  }

  return { ok: true };
}
