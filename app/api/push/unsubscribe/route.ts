import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase/auth";

const unsubscribeSchema = z.object({
  endpoint: z.string().url()
});

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const body = unsubscribeSchema.parse(await request.json());

    const { data, error } = await auth.supabase
      .from("push_subscriptions")
      .update({ is_active: false, last_seen_at: new Date().toISOString() })
      .eq("endpoint", body.endpoint)
      .eq("user_id", auth.user.id)
      .select("id")
      .maybeSingle();

    if (error) {
      if (error.code === "42501") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      return NextResponse.json({ error: "Failed to update subscription" }, { status: 500 });
    }

    // Idempotent success even if already inactive or absent.
    return NextResponse.json({ ok: true, found: Boolean(data) }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request format" }, { status: 400 });
  }
}
