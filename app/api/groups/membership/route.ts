import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const querySchema = z.object({
  groupId: z.string().uuid()
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const payload = querySchema.parse({
      groupId: url.searchParams.get("groupId")
    });

    const supabase = await createSupabaseServerClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ membership: null });
    }

    const { data, error } = await supabase
      .from("group_members")
      .select("group_id, user_id, role, status, created_at")
      .eq("group_id", payload.groupId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ membership: data ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
