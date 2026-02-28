import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";

export async function POST(request: Request) {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    try {
        const subscription = await request.json();

        if (!subscription || !subscription.endpoint || !subscription.keys) {
            return NextResponse.json({ error: "Invalid subscription payload" }, { status: 400 });
        }

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
            return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
        }

        return NextResponse.json({ ok: true }, { status: 201 });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }
}
