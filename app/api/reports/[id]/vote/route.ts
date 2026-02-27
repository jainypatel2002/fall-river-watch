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

    const { error } = await auth.supabase.from("report_votes").insert({
      report_id: id,
      voter_id: auth.user.id,
      vote_type: payload.voteType
    });

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return NextResponse.json({ error: "You already voted on this report" }, { status: 409 });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await runReportExpiration(auth.supabase);

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
