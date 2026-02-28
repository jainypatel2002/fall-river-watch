import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  const { id } = await context.params;

  const { data: profile } = await auth.supabase.from("profiles").select("role").eq("id", auth.user.id).single();
  const isAdmin = profile?.role === "admin" || profile?.role === "mod";
  const activeClient = isAdmin ? createSupabaseAdminClient() : auth.supabase;

  let query = activeClient.from("incident_comments").delete().eq("id", id);
  if (!isAdmin) {
    query = query.eq("user_id", auth.user.id);
  }

  const { data, error } = await query.select("id").maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    const { body } = await request.json();

    if (typeof body !== "string" || !body.trim()) {
      return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
    }

    const { data: profile } = await auth.supabase.from("profiles").select("role").eq("id", auth.user.id).single();
    const isAdmin = profile?.role === "admin" || profile?.role === "mod";
    const activeClient = isAdmin ? createSupabaseAdminClient() : auth.supabase;

    let query = activeClient.from("incident_comments").update({ body: body.trim() }).eq("id", id);
    if (!isAdmin) {
      query = query.eq("user_id", auth.user.id);
    }

    const { data, error } = await query.select("id").maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ error: "Comment not found or unauthorized" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
