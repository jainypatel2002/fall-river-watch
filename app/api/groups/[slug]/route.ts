import { NextResponse } from "next/server";
import { updateGroupSchema } from "@/lib/schemas/groups";
import { loadGroupContext } from "@/lib/server/groups";
import { getUserRole } from "@/lib/server/roles";
import { requireAuth } from "@/lib/supabase/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await context.params;
    const supabase = await createSupabaseServerClient();

    const {
      data: { user }
    } = await supabase.auth.getUser();

    const role = user ? await getUserRole(supabase, user.id) : null;

    const groupContext = await loadGroupContext({
      supabase,
      slug,
      userId: user?.id ?? null,
      role
    });

    if (!groupContext) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json({
      group: groupContext.group,
      membership: groupContext.membership,
      can_manage: groupContext.canManage,
      can_view_content: groupContext.canViewContent,
      accepted_members: groupContext.acceptedMembers
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ slug: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { slug } = await context.params;
    const role = await getUserRole(auth.supabase, auth.user.id);
    const groupContext = await loadGroupContext({
      supabase: auth.supabase,
      slug,
      userId: auth.user.id,
      role
    });

    if (!groupContext) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    if (!groupContext.canManage) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const payload = updateGroupSchema.parse(body);

    const patch: Record<string, string | null> = {};
    if (typeof payload.name !== "undefined") patch.name = payload.name;
    if (typeof payload.description !== "undefined") patch.description = payload.description;

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { data: updated, error } = await auth.supabase
      .from("groups")
      .update(patch)
      .eq("id", groupContext.group.id)
      .select("*")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!updated) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json({ group: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { slug } = await context.params;
    const role = await getUserRole(auth.supabase, auth.user.id);
    const groupContext = await loadGroupContext({
      supabase: auth.supabase,
      slug,
      userId: auth.user.id,
      role
    });

    if (!groupContext) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const { data, error } = await auth.supabase.rpc("delete_group_atomic", {
      p_group_id: groupContext.group.id
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!data) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
