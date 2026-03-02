import { NextResponse } from "next/server";
import { loadGroupContext } from "@/lib/server/groups";
import { getUserRole } from "@/lib/server/roles";
import { requireAuth } from "@/lib/supabase/auth";

export async function DELETE(_request: Request, context: { params: Promise<{ slug: string; postId: string }> }) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const { slug, postId } = await context.params;
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

    const { data: post, error: postError } = await auth.supabase
      .from("group_posts")
      .select("id, group_id, author_user_id")
      .eq("id", postId)
      .maybeSingle();

    if (postError) {
      return NextResponse.json({ error: postError.message }, { status: 400 });
    }

    if (!post || post.group_id !== groupContext.group.id) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const canDelete = post.author_user_id === auth.user.id || groupContext.canManage;

    if (!canDelete) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await auth.supabase.from("group_posts").delete().eq("id", post.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
