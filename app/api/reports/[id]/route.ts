import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteReportWithCleanup } from "@/lib/server/report-delete";
import { isAdmin } from "@/lib/server/roles";

const updateReportSchema = z
  .object({
    title: z.string().trim().max(120, "Title must be 120 characters or fewer").optional().or(z.literal("")),
    description: z
      .string()
      .trim()
      .min(20, "Description must be at least 20 characters")
      .max(500, "Description must be 500 characters or fewer")
      .optional()
  })
  .refine((value) => typeof value.title !== "undefined" || typeof value.description !== "undefined", {
    message: "No valid fields to update"
  });

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const supabase = await createSupabaseServerClient();

    const { data: accessibleReport, error: accessError } = await supabase.from("reports").select("id").eq("id", id).maybeSingle();

    const accessErrorText = `${accessError?.message ?? ""} ${(accessError as any)?.details ?? ""} ${(accessError as any)?.hint ?? ""}`.toLowerCase();
    if (accessError) {
      if (accessError.code === "42501" || accessErrorText.includes("permission denied") || accessErrorText.includes("row-level security")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.json({ error: "Failed to load report detail" }, { status: 500 });
    }

    const { data: detailRows, error: detailError } = await supabase.rpc("get_report_detail", {
      p_report_id: id
    });

    const detailErrorText = `${detailError?.message ?? ""} ${(detailError as any)?.details ?? ""} ${(detailError as any)?.hint ?? ""}`.toLowerCase();
    if (detailError) {
      if (detailError.code === "42501" || detailErrorText.includes("permission denied") || detailErrorText.includes("row-level security")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.json({ error: "Failed to load report detail" }, { status: 500 });
    }

    if (!detailRows?.length) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    if (!accessibleReport) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({
      report: detailRows[0],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
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

    return NextResponse.json({
      ok: true,
      warning: result.warning
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    const { data: report, error: reportError } = await auth.supabase
      .from("reports")
      .select("id, reporter_id, title, description")
      .eq("id", id)
      .maybeSingle();

    if (reportError) {
      return NextResponse.json({ error: reportError.message }, { status: 500 });
    }

    if (!report) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }

    const userIsAdmin = await isAdmin(auth.supabase, auth.user.id);
    const isOwner = report.reporter_id === auth.user.id;
    if (!isOwner && !userIsAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const payload = updateReportSchema.parse(body);
    const nextTitle = typeof payload.title === "undefined" ? report.title : payload.title;
    const nextDescription = typeof payload.description === "undefined" ? report.description : payload.description;

    const { error: updateError } = await auth.supabase.rpc("update_report_content", {
      p_report_id: id,
      p_title: nextTitle ?? null,
      p_description: nextDescription
    });

    if (updateError) {
      if (updateError.message === "Report not found") {
        return NextResponse.json({ error: updateError.message }, { status: 404 });
      }

      if (updateError.message === "Unauthorized") {
        return NextResponse.json({ error: updateError.message }, { status: 401 });
      }

      if (updateError.message === "Forbidden") {
        return NextResponse.json({ error: updateError.message }, { status: 403 });
      }

      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request body" }, { status: 400 });
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
