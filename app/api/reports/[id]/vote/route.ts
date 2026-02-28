import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase/auth";
import { enforceDailyLimit } from "@/lib/server/rate-limit";
import { applyReportVerification, type VerificationStatus } from "@/lib/server/report-verification";
import { runReportExpiration } from "@/lib/server/reports";

const reportVoteSchema = z
  .object({
    voteType: z.enum(["confirm", "dispute", "clear"]).optional(),
    status: z.enum(["confirm", "dispute"]).nullable().optional()
  })
  .refine((value) => typeof value.status !== "undefined" || typeof value.voteType !== "undefined", {
    message: "Verification status is required"
  });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { id } = await context.params;

  try {
    const body = await request.json();
    const payload = reportVoteSchema.parse(body);
    const requestedStatus: VerificationStatus =
      typeof payload.status !== "undefined"
        ? payload.status
        : payload.voteType === "clear"
        ? null
        : payload.voteType === "confirm" || payload.voteType === "dispute"
        ? payload.voteType
        : null;

    const { data: existingVote, error: existingVoteError } = await auth.supabase
      .from("report_votes")
      .select("id")
      .eq("report_id", id)
      .eq("voter_id", auth.user.id)
      .maybeSingle();

    if (existingVoteError) {
      return NextResponse.json({ error: existingVoteError.message }, { status: 500 });
    }

    if (!existingVote && requestedStatus !== null) {
      const rateCheck = await enforceDailyLimit({
        supabase: auth.supabase,
        table: "report_votes",
        userColumn: "voter_id",
        userId: auth.user.id,
        limit: 60
      });

      if (!rateCheck.ok) {
        return NextResponse.json({ error: rateCheck.reason }, { status: 429 });
      }
    }

    const result = await applyReportVerification({
      supabase: auth.supabase,
      incidentId: id,
      userId: auth.user.id,
      status: requestedStatus
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await runReportExpiration(auth.supabase);

    return NextResponse.json({
      ok: true,
      incident_id: result.incident_id,
      user_status: result.user_status,
      counts: result.counts,
      vote: {
        confirms: result.counts.confirm,
        disputes: result.counts.dispute,
        user_vote: result.user_status
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
