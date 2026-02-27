import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { id } = await context.params;

  const { data, error } = await auth.supabase
    .from("incident_comments")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
