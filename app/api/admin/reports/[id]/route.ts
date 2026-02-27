import { NextResponse } from "next/server";
import { deleteReportWithCleanup } from "@/lib/server/report-delete";
import { adminReportUpdateSchema } from "@/lib/schemas/report";
import { requireAdmin } from "@/lib/supabase/auth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { id } = await context.params;

  try {
    const body = await request.json();
    const payload = adminReportUpdateSchema.parse(body);

    const { error } = await auth.supabase.from("reports").update({ status: payload.status }).eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { id } = await context.params;

  const result = await deleteReportWithCleanup(auth.supabase, id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    warning: result.warning
  });
}
