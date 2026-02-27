import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { reportCommentSchema } from "@/lib/schemas/incident";
import { requireAuth } from "@/lib/supabase/auth";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { id } = await context.params;

  try {
    const body = await request.json();
    const payload = reportCommentSchema.parse(body);

    const { data: commentExists, error: checkError } = await auth.supabase.from("incident_comments").select("id").eq("id", id).maybeSingle();

    if (checkError) {
      return NextResponse.json({ error: checkError.message }, { status: 500 });
    }

    if (!commentExists) {
      return NextResponse.json({ error: "Comment not found" }, { status: 404 });
    }

    const { error } = await auth.supabase.from("comment_reports").upsert(
      {
        comment_id: id,
        reporter_user_id: auth.user.id,
        reason: payload.reason?.trim() || null
      },
      {
        onConflict: "comment_id,reporter_user_id",
        ignoreDuplicates: true
      }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    const status = error instanceof ZodError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
