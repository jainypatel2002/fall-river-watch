import { NextResponse } from "next/server";
import { groupDecisionSchema } from "@/lib/schemas/groups";
import { loadGroupContext } from "@/lib/server/groups";
import { getUserRole } from "@/lib/server/roles";
import { requireAuth } from "@/lib/supabase/auth";

export async function POST(request: Request, context: { params: Promise<{ slug: string; userId: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { slug, userId } = await context.params;
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
    const payload = groupDecisionSchema.parse(body);

    const { data, error } = await auth.supabase.rpc("respond_to_group_request", {
      p_group_id: groupContext.group.id,
      p_user_id: userId,
      p_decision: payload.decision
    });

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Failed to update request" }, { status: 400 });
    }

    return NextResponse.json({ membership: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
