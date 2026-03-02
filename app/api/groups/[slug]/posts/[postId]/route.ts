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

    const { error, count } = await auth.supabase
      .from("group_posts")
      .delete({ count: "exact" })
      .eq("id", postId)
      .eq("group_id", groupContext.group.id)

    if (error) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[group-post-delete] delete failed", {
          code: error.code,
          message: error.message,
          postId,
          groupId: groupContext.group.id
        });
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!count) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[group-post-delete] no rows deleted", {
          postId,
          groupId: groupContext.group.id,
          userId: auth.user.id
        });
      }
      return NextResponse.json({ error: "Post not found or you do not have permission to delete it" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      const parsed = error as Error;
      console.log("[group-post-delete] unexpected error", {
        message: parsed.message
      });
    }
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
