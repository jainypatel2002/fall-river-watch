import { NextResponse } from "next/server";
import { sendGroupChatMessageSchema } from "@/lib/schemas/groups";
import { loadGroupContext } from "@/lib/server/groups";
import { getUserRole } from "@/lib/server/roles";
import { requireAuth } from "@/lib/supabase/auth";
import type { GroupChatMessage } from "@/lib/types/groups";

function toChatMessages(
  rows: Array<{ id: string; group_id: string; user_id: string; anon_name: string; is_anonymous: boolean; message: string; created_at: string }>,
  currentUserId: string
): GroupChatMessage[] {
  return rows.map((row) => ({
    ...row,
    is_owner: row.user_id === currentUserId
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
      .from("group_chat_messages")
      .select("id, group_id, user_id, anon_name, is_anonymous, message, created_at")
      .eq("group_id", groupContext.group.id)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ messages: toChatMessages(data ?? [], auth.user.id) });
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
    const payload = sendGroupChatMessageSchema.parse(body);
    const isAnonymous = payload.is_anonymous;
    let nameForMessage = "";

    if (isAnonymous) {
      const { data: anonName, error: identityError } = await auth.supabase.rpc("ensure_group_anon_identity", {
        p_group_id: groupContext.group.id
      });

      if (identityError || !anonName) {
        return NextResponse.json({ error: identityError?.message ?? "Failed to initialize anonymous identity" }, { status: 400 });
      }

      if (payload.anon_name !== anonName) {
        return NextResponse.json({ error: "Anonymous identity mismatch. Refresh and try again." }, { status: 409 });
      }

      nameForMessage = anonName;
    } else {
      const { data: displayName, error: displayNameError } = await auth.supabase.rpc("safe_profile_display_name", {
        p_uid: auth.user.id
      });

      if (displayNameError || !displayName) {
        return NextResponse.json({ error: displayNameError?.message ?? "Failed to resolve display name" }, { status: 400 });
      }

      nameForMessage = displayName;
    }

    const { data, error } = await auth.supabase
      .from("group_chat_messages")
      .insert({
        group_id: groupContext.group.id,
        user_id: auth.user.id,
        anon_name: nameForMessage,
        is_anonymous: isAnonymous,
        message: payload.message
      })
      .select("id, group_id, user_id, anon_name, is_anonymous, message, created_at")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Failed to send message" }, { status: 400 });
    }

    const [message] = toChatMessages([data], auth.user.id);
    return NextResponse.json({ message }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
