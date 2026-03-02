import { NextResponse } from "next/server";
import { createGroupPostSchema } from "@/lib/schemas/groups";
import { loadGroupContext } from "@/lib/server/groups";
import { getUserRole } from "@/lib/server/roles";
import { requireAuth } from "@/lib/supabase/auth";
import type { GroupPost } from "@/lib/types/groups";

async function withAuthorProfiles(
  rows: Array<{
    id: string;
    group_id: string;
    author_user_id: string;
    title: string | null;
    content: string;
    created_at: string;
    updated_at: string;
  }>,
  roleLookup: {
    userId: string;
    isManager: boolean;
  },
  profileRows: Array<{ id: string; display_name: string | null }> | null
): Promise<GroupPost[]> {
  const profileById = new Map<string, string>();
  for (const row of profileRows ?? []) {
    profileById.set(row.id, row.display_name?.trim() || "Neighbor");
  }

  return rows.map((row) => ({
    ...row,
    author_display_name: profileById.get(row.author_user_id) ?? "Neighbor",
    can_manage: roleLookup.isManager || row.author_user_id === roleLookup.userId
  }));
}

export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
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

    if (!groupContext.canViewContent) {
      return NextResponse.json({ error: "Follow required" }, { status: 403 });
    }

    const { data, error } = await auth.supabase
      .from("group_posts")
      .select("id, group_id, author_user_id, title, content, created_at, updated_at")
      .eq("group_id", groupContext.group.id)
      .order("created_at", { ascending: false })
      .limit(120);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const userIds = [...new Set((data ?? []).map((row) => row.author_user_id))];
    const { data: profiles } = userIds.length
      ? await auth.supabase.from("profiles").select("id, display_name").in("id", userIds)
      : { data: [] as Array<{ id: string; display_name: string | null }> };

    const posts = await withAuthorProfiles(data ?? [], { userId: auth.user.id, isManager: groupContext.canManage }, profiles);

    return NextResponse.json({ posts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

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

    if (!groupContext.canViewContent) {
      return NextResponse.json({ error: "Follow required" }, { status: 403 });
    }

    const body = await request.json();
    const payload = createGroupPostSchema.parse(body);

    const { data, error } = await auth.supabase
      .from("group_posts")
      .insert({
        group_id: groupContext.group.id,
        author_user_id: auth.user.id,
        title: payload.title?.trim() || null,
        content: payload.content.trim()
      })
      .select("id, group_id, author_user_id, title, content, created_at, updated_at")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Failed to create post" }, { status: 400 });
    }

    const { data: profile } = await auth.supabase
      .from("profiles")
      .select("id, display_name")
      .eq("id", auth.user.id)
      .maybeSingle();

    const [post] = await withAuthorProfiles([data], { userId: auth.user.id, isManager: groupContext.canManage }, profile ? [profile] : []);

    return NextResponse.json({ post }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
