import webpush from "web-push";
import { prettyCategory } from "@/lib/utils/format";

const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT;

if (publicVapidKey && privateVapidKey && subject) {
    webpush.setVapidDetails(subject, publicVapidKey, privateVapidKey);
}

interface WebPushOptions {
    subscription: webpush.PushSubscription;
    incidentId: string;
    category: string;
    title: string | null;
    distanceMiles: number;
}

export async function sendWebPush({
    subscription,
    incidentId,
    category,
    title,
    distanceMiles
}: WebPushOptions): Promise<{ statusCode: number }> {
    if (!publicVapidKey || !privateVapidKey) {
        console.warn("Skipping web push: VAPID keys missing.");
        return { statusCode: 200 };
    }

    const payload = JSON.stringify({
        title: `New ${prettyCategory(category)} Alert`,
        body: `${title ? title + " • " : ""}${distanceMiles.toFixed(1)} mi away`,
        url: `/?reportId=${incidentId}`
    });

    try {
        const result = await webpush.sendNotification(subscription, payload);
        return { statusCode: result.statusCode };
    } catch (err: any) {
        return { statusCode: err.statusCode || 500 };
    }
}
