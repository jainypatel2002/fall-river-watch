import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { sendIncidentEmail } from "@/lib/email/send";
import { sendWebPush } from "@/lib/push/send";

export async function POST() {
    const auth = await requireAuth();
    if (auth.response) return auth.response;

    try {
        // Determine the target email to test - prioritizing explicit manual vars initially
        const targetEmail = process.env.TEST_TO_EMAIL || auth.user.email;
        if (!targetEmail) {
            return NextResponse.json({ error: "No email resolved for user" }, { status: 400 });
        }

        // 1. Fetch user channels via settings UI
        const { data: pref } = await auth.supabase
            .from("notification_subscriptions")
            .select("channels")
            .eq("user_id", auth.user.id)
            .maybeSingle();

        const channels = pref?.channels || [];
        const results: string[] = [];

        // 2. Email Test
        if (channels.includes("email")) {
            await sendIncidentEmail({
                to: targetEmail,
                incidentId: "test-incident-uuid",
                category: "suspicious_activity",
                title: "Test Alert",
                description: "This is a Dev/Test Notification configured by your Notification Preferences.",
                distanceMiles: 0
            });
            results.push("Email sent");
        }

        // 3. Web Push Test
        let pushDisabledOrFailed = false;
        if (channels.includes("web_push") || channels.includes("push")) {
            const { data: subs } = await auth.supabase
                .from("push_subscriptions")
                .select("endpoint, p256dh, auth")
                .eq("user_id", auth.user.id)
                .eq("is_active", true);

            if (subs && subs.length > 0) {
                for (const sub of subs) {
                    const pushRes = await sendWebPush({
                        subscription: {
                            endpoint: sub.endpoint,
                            keys: { p256dh: sub.p256dh, auth: sub.auth }
                        },
                        incidentId: "test-incident-uuid",
                        category: "suspicious_activity",
                        title: "Test Alert",
                        distanceMiles: 0
                    });
                    if (pushRes.statusCode >= 400) {
                        pushDisabledOrFailed = true;
                    }
                }
                if (!pushDisabledOrFailed) {
                    results.push("Web Push Sent");
                }
            } else {
                results.push("Web Push attempted, but no active subscriptions exist for this user.");
            }
        }

        return NextResponse.json({
            ok: true,
            message: results.length ? results.join(", ") : "No channels configured in user preferences"
        }, { status: 200 });

    } catch (error) {
        console.error("[Test Notification API Error]", error);
        return NextResponse.json({ error: "Test dispatch failed" }, { status: 500 });
    }
}
