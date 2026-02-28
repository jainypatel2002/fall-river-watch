import { createClient } from "@supabase/supabase-js";
import { calculateDistanceMiles } from "@/lib/geo/haversine";
import { isQuietHours } from "@/lib/time/quietHours";
import { sendIncidentEmail } from "@/lib/email/send";
import { sendWebPush } from "@/lib/push/send";

// Ensure we have server-role access for raw background tasks that touch other user rows
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface DispatchOptions {
    incidentId: string;
    category: string;
    title: string | null;
    description: string;
    lat: number;
    lng: number;
}

export async function dispatchNotifications(incident: DispatchOptions) {
    try {
        // 1. Fetch enabled preferences globally
        // We cannot filter easily by GIN in standard JS without a complex RPC, so we filter categories locally assuming < thousands globally
        // or use a structured query. We'll use a standard filter then map since we're Server Side.
        const { data: preferences, error: prefError } = await supabase
            .from("notification_subscriptions")
            .select("user_id, channels, radius_miles, categories, quiet_start, quiet_end, center_lat, center_lng, timezone")
            .eq("enabled", true);

        if (prefError || !preferences) {
            console.error("[Dispatch Error] Failed fetching preferences", prefError);
            return;
        }

        const { data: profiles } = await supabase.from("profiles").select("id, email");

        const promises = preferences.map(async (pref) => {
            // 2. Eligibility checks
            if (pref.categories && pref.categories.length > 0 && !pref.categories.includes(incident.category)) return;

            if (!pref.center_lat || !pref.center_lng) return;

            const miles = calculateDistanceMiles(incident.lat, incident.lng, pref.center_lat, pref.center_lng);
            if (miles > pref.radius_miles) return;

            if (isQuietHours(pref.quiet_start, pref.quiet_end, pref.timezone)) return;

            const profile = profiles?.find((p) => p.id === pref.user_id);
            if (!profile) return;

            // 3. For each selected channel
            for (const channel of pref.channels) {
                // Attempt insert to notification_deliveries with unique constraint for dedupe
                const { error: deliveryError } = await supabase.from("notification_deliveries").insert({
                    user_id: pref.user_id,
                    incident_id: incident.incidentId,
                    channel
                });

                // Unique constraint violation means we already sent it (error code 23505)
                if (deliveryError && deliveryError.code === "23505") continue;
                // Ignore other delivery errors softly and proceed

                if (channel === "email" && profile.email) {
                    await sendIncidentEmail({
                        to: profile.email,
                        incidentId: incident.incidentId,
                        category: incident.category,
                        title: incident.title,
                        description: incident.description,
                        distanceMiles: miles
                    });
                }
                else if (channel === "web_push" || channel === "push") { // cater for both variants securely
                    // fetch active push subs
                    const { data: subs } = await supabase
                        .from("push_subscriptions")
                        .select("endpoint, p256dh, auth")
                        .eq("user_id", pref.user_id)
                        .eq("is_active", true);

                    if (subs && subs.length > 0) {
                        for (const sub of subs) {
                            const pushReq = {
                                endpoint: sub.endpoint,
                                keys: {
                                    p256dh: sub.p256dh,
                                    auth: sub.auth
                                }
                            };

                            const pushRes = await sendWebPush({
                                subscription: pushReq,
                                incidentId: incident.incidentId,
                                category: incident.category,
                                title: incident.title,
                                distanceMiles: miles
                            });

                            // Invalid/dormant endpoints
                            if (pushRes.statusCode === 410 || pushRes.statusCode === 404) {
                                await supabase.from("push_subscriptions").update({ is_active: false }).eq("endpoint", sub.endpoint);
                            }
                        }
                    }
                }
            }
        });

        await Promise.allSettled(promises);
    } catch (error) {
        console.error("[Dispatch Critical Error]", error);
    }
}
