import { NextResponse } from "next/server";
import { voteSchema } from "@/lib/schemas/report";
import { requireAuth } from "@/lib/supabase/auth";
import { enforceDailyLimit } from "@/lib/server/rate-limit";
import { runReportExpiration } from "@/lib/server/reports";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { id } = await context.params;

  try {
    const body = await request.json();
    const payload = voteSchema.parse(body);

    const { data: existingVote, error: existingVoteError } = await auth.supabase
      .from("report_votes")
      .select("id")
      .eq("report_id", id)
      .eq("voter_id", auth.user.id)
      .maybeSingle();

    if (existingVoteError) {
      return NextResponse.json({ error: existingVoteError.message }, { status: 400 });
    }

    if (!existingVote) {
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

    const { data: voteRows, error } = await auth.supabase.rpc("vote_on_report", {
      p_report_id: id,
      p_vote: payload.voteType
    });

    if (error) {
      if (error.message === "Report not found") {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (error.message === "Unauthorized") {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const voteRow = (Array.isArray(voteRows) ? voteRows[0] : voteRows) as
      | { confirms_count?: number; disputes_count?: number; user_vote?: "confirm" | "dispute" | null }
      | null;

    if (!voteRow) {
      return NextResponse.json({ error: "Vote could not be applied" }, { status: 500 });
    }

    await runReportExpiration(auth.supabase);

    return NextResponse.json({
      ok: true,
      vote: {
        confirms: Number(voteRow.confirms_count ?? 0),
        disputes: Number(voteRow.disputes_count ?? 0),
        user_vote: voteRow.user_vote ?? null
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
