import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase/auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { id } = await context.params;
    const body = await request.json();

    const { data: profile } = await auth.supabase.from("profiles").select("role").eq("id", auth.user.id).single();
    const isAdmin = profile?.role === "admin" || profile?.role === "mod";
    const activeClient = isAdmin ? createSupabaseAdminClient() : auth.supabase;

    // Build update object based on allowed fields (this assumes title and description only for brevity based on existing flows, but can be expanded)
    const updateData: any = {};
    if (typeof body.title !== "undefined") updateData.title = body.title;
    if (typeof body.description !== "undefined") updateData.description = body.description;

    // Add additional fields here if your schema allows it. We don't want to blindly pass body to update.
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const { error } = await activeClient
      .from("reports")
      .update(updateData)
      .eq("id", id)
      // If not admin, the row-level security on the `auth.supabase` client handles enforcing ownership, 
      // but conditionally applying it guarantees no accidents.
      .eq(isAdmin ? "" : "reporter_id", isAdmin ? "" : auth.user.id);

    // Because supabase ignores empty match strings, we conditionally omit the eq if admin
    let query = activeClient.from("reports").update(updateData).eq("id", id);
    if (!isAdmin) {
      query = query.eq("reporter_id", auth.user.id);
    }

    const { error: finalError } = await query;

    if (finalError) {
      return NextResponse.json({ error: finalError.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
