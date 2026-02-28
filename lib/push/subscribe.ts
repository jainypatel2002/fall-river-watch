/**
 * Generates safely encoded VAPID vectors from the public NextJS process environment.
 */
function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

export async function subscribeToPush(): Promise<{ success: boolean; message?: string }> {
    if (typeof window === "undefined") {
        return { success: false, message: "Server-side." };
    }

    // Check iOS Standalone PWA constraints safely
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !("MSStream" in window);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone;

    if (isIos && !isStandalone) {
        return { success: false, message: "On iPhone, push tracking works best after installing to Home Screen (PWA)." };
    }

    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        return { success: false, message: "Push not supported on this device/browser. Use Email." };
    }

    try {
        // 1. Check or Request Permissions explicitly
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
            return { success: false, message: "Notification permission denied." };
        }

        // 2. Safely register Service Worker
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;

        // 3. Initiate Subscription via VAPID vectors
        const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidKey) {
            console.warn("Missing public vapid key.");
            return { success: false, message: "Server configuration missing." };
        }

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidKey)
        });

        // 4. Send subscription config payload to the backend endpoints securely using JSON parse blocks
        const response = await fetch("/api/push/subscribe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(subscription)
        });

        if (!response.ok) {
            return { success: false, message: "Database synchronization blocked by network errors." };
        }

        return { success: true };
    } catch (error: any) {
        console.warn("Subscribe failed:", error);
        return { success: false, message: error.message };
    }
}

export async function checkPushActive(): Promise<boolean> {
    if (typeof window === "undefined") return false;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return false;

    try {
        const registration = await navigator.serviceWorker.getRegistration("/sw.js");
        if (!registration) return false;

        const subscription = await registration.pushManager.getSubscription();
        return !!subscription;
    } catch {
        return false;
    }
}
