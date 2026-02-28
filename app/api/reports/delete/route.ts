import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteReportWithCleanup } from "@/lib/server/report-delete";
import { requireAuth } from "@/lib/supabase/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const deleteReportSchema = z.object({
  reportId: z.string().uuid()
});

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const body = await request.json();
    const payload = deleteReportSchema.parse(body);

    const { data: profile } = await auth.supabase.from("profiles").select("role").eq("id", auth.user.id).single();
    const isAdmin = profile?.role === "admin" || profile?.role === "mod";

    // If regular user, delete report through standard mapped client (uses RLS)
    // If admin, escalate to service_role client to bypass row level security
    const activeClient = isAdmin ? createSupabaseAdminClient() : auth.supabase;

    const result = await deleteReportWithCleanup(activeClient, payload.reportId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      warning: result.warning
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
