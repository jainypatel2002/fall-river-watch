import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/supabase/auth";

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1)
  })
});

export async function POST(request: Request) {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const subscription = pushSubscriptionSchema.parse(await request.json());

    const { error } = await auth.supabase.from("push_subscriptions").upsert(
      {
        user_id: auth.user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: request.headers.get("user-agent") || null,
        is_active: true,
        last_seen_at: new Date().toISOString()
      },
      { onConflict: "endpoint" }
    );

    if (error) {
      console.error("Push subscribe error", error);

      if (error.code === "23505") {
        return NextResponse.json({ error: "Subscription conflict" }, { status: 409 });
      }

      if (error.code === "42501") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
  }
}
