import { NextResponse } from "next/server";
import { groupVisibilityToggleSchema } from "@/lib/schemas/groups";
import { loadGroupContext } from "@/lib/server/groups";
import { getUserRole } from "@/lib/server/roles";
import { requireAuth } from "@/lib/supabase/auth";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
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

    const body = await request.json();
    const payload = groupVisibilityToggleSchema.parse(body);

    const { data, error } = await auth.supabase.rpc("toggle_group_visibility", {
      p_group_id: groupContext.group.id,
      p_visibility: payload.visibility
    });

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Failed to update group visibility" }, { status: 400 });
    }

    return NextResponse.json({ group: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
