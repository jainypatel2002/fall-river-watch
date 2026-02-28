import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/supabase/auth";
import { sendIncidentEmail } from "@/lib/email/send";
import { sendWebPush } from "@/lib/push/send";
import { isAdmin } from "@/lib/server/roles";

export async function POST() {
  const auth = await requireAuth();
  if (auth.response) return auth.response;

  try {
    const userIsAdmin = await isAdmin(auth.supabase, auth.user.id);
    const isDev = process.env.NODE_ENV === "development";
    if (!isDev && !userIsAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const targetEmail = process.env.TEST_TO_EMAIL || auth.user.email;
    const { data: pref } = await auth.supabase
      .from("notification_subscriptions")
      .select("channels")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    const channels = pref?.channels || [];
    let emailSent = false;
    let pushSent = 0;
    let pushFailed = 0;

    if (channels.includes("email") && targetEmail) {
      await sendIncidentEmail({
        to: targetEmail,
        incidentId: "test-incident-uuid",
        category: "suspicious_activity",
        title: "Test Alert",
        description: "This is a Dev/Test Notification configured by your Notification Preferences.",
        distanceMiles: 0
      });
      emailSent = true;
    }

    if (channels.includes("web_push") || channels.includes("push")) {
      const { data: subs, error: subsError } = await auth.supabase
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", auth.user.id)
        .eq("is_active", true);

      if (subsError) {
        return NextResponse.json({ error: subsError.message }, { status: 500 });
      }

      for (const sub of subs ?? []) {
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

        if (pushRes.statusCode >= 200 && pushRes.statusCode < 300) {
          pushSent += 1;
          continue;
        }

        pushFailed += 1;

        if (pushRes.statusCode === 404 || pushRes.statusCode === 410) {
          await auth.supabase.from("push_subscriptions").update({ is_active: false }).eq("endpoint", sub.endpoint);
        }
      }
    }

    return NextResponse.json(
      {
        ok: true,
        pushSent,
        pushFailed,
        emailSent
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("[Test Notification API Error]", error);
    return NextResponse.json({ error: "Test dispatch failed" }, { status: 500 });
  }
}
