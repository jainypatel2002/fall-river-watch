import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";

export async function POST(request: Request) {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    try {
        const body = await request.json();
        const endpoint = body.endpoint;

        if (!endpoint) {
            return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
        }

        // Mark inactive instead of raw DB delete for robust logs
        await auth.supabase
            .from("push_subscriptions")
            .update({ is_active: false })
            .eq("endpoint", endpoint)
            .eq("user_id", auth.user.id);

        return NextResponse.json({ ok: true });
    } catch (error) {
        return NextResponse.json({ error: "Invalid request format" }, { status: 400 });
    }
}
