import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertGroupPreferencesSchema } from "@/lib/schemas/groups";
import { loadGroupContext } from "@/lib/server/groups";
import { getUserRole } from "@/lib/server/roles";
import { requireAuth } from "@/lib/supabase/auth";

function fallbackDisplayName(userId: string) {
  return `Member-${userId.replace(/-/g, "").slice(-4)}`;
}

async function loadDisplayName(supabase: Pick<SupabaseClient, "rpc">, userId: string) {
  const fallback = fallbackDisplayName(userId);
  const { data, error } = await supabase.rpc("safe_profile_display_name", {
    p_uid: userId
  });
  if (error || !data) return fallback;
  return data;
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
      .from("group_user_preferences")
      .select("group_id, user_id, post_anonymous, chat_anonymous, created_at, updated_at")
      .eq("group_id", groupContext.group.id)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const displayName = await loadDisplayName(auth.supabase, auth.user.id);
    const preferences = data ?? {
      group_id: groupContext.group.id,
      user_id: auth.user.id,
      post_anonymous: false,
      chat_anonymous: true,
      created_at: null,
      updated_at: null
    };

    return NextResponse.json({
      preferences,
      display_name: displayName
    });
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
    const payload = upsertGroupPreferencesSchema.parse(body);

    const { data: current, error: currentError } = await auth.supabase
      .from("group_user_preferences")
      .select("post_anonymous, chat_anonymous")
      .eq("group_id", groupContext.group.id)
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (currentError) {
      return NextResponse.json({ error: currentError.message }, { status: 400 });
    }

    const nextPostAnonymous = typeof payload.post_anonymous === "boolean" ? payload.post_anonymous : current?.post_anonymous ?? false;
    const nextChatAnonymous = typeof payload.chat_anonymous === "boolean" ? payload.chat_anonymous : current?.chat_anonymous ?? true;

    const { data, error } = await auth.supabase
      .from("group_user_preferences")
      .upsert(
        {
          group_id: groupContext.group.id,
          user_id: auth.user.id,
          post_anonymous: nextPostAnonymous,
          chat_anonymous: nextChatAnonymous
        },
        {
          onConflict: "group_id,user_id"
        }
      )
      .select("group_id, user_id, post_anonymous, chat_anonymous, created_at, updated_at")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Failed to save preferences" }, { status: 400 });
    }

    const displayName = await loadDisplayName(auth.supabase, auth.user.id);

    return NextResponse.json({
      preferences: data,
      display_name: displayName
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
