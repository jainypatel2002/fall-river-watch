type PushFailureCode =
  | "unsupported"
  | "ios_not_installed"
  | "permission_denied"
  | "vapid_missing"
  | "registration_failed"
  | "subscribe_failed"
  | "backend_failed";

export type PushSubscribeResult =
  | {
      success: true;
      message: string;
      code: "subscribed" | "already_subscribed";
    }
  | {
      success: false;
      message: string;
      code: PushFailureCode;
      recoverable: boolean;
      unsupported: boolean;
    };

type PushSupportInfo = {
  supported: boolean;
  message?: string;
  unsupported: boolean;
  code: PushFailureCode;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

function getPushSupportInfo(): PushSupportInfo {
  if (typeof window === "undefined") {
    return {
      supported: false,
      unsupported: true,
      code: "unsupported",
      message: "Web Push is unavailable in this environment."
    };
  }

  const supportsPushStack =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supportsPushStack) {
    return {
      supported: false,
      unsupported: true,
      code: "unsupported",
      message: "Web Push not supported on this device/browser. Use Email alerts."
    };
  }

  const isIos =
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  if (isIos && !isStandalone) {
    return {
      supported: false,
      unsupported: true,
      code: "ios_not_installed",
      message: "On iPhone, enable Web Push by adding this app to your Home Screen (Share -> Add to Home Screen)."
    };
  }

  return {
    supported: true,
    unsupported: false,
    code: "unsupported"
  };
}

function toUserFacingPushError(error: unknown): { code: PushFailureCode; message: string; recoverable: boolean } {
  const err = error as { name?: string; message?: string };
  const name = err?.name ?? "Error";
  const message = err?.message ?? "Unknown push subscription error";

  if (process.env.NODE_ENV === "development") {
    console.error("[push subscribe] failure", {
      name,
      message
    });
  }

  if (name === "NotAllowedError") {
    return {
      code: "permission_denied",
      message: "Notification permission denied. Enable notifications in your browser settings.",
      recoverable: true
    };
  }

  if (name === "InvalidAccessError") {
    return {
      code: "subscribe_failed",
      message: "Push key mismatch detected. Refresh the page and try again.",
      recoverable: true
    };
  }

  if (name === "AbortError" || name === "NotSupportedError") {
    return {
      code: "subscribe_failed",
      message: "Push service is temporarily unavailable for this browser. Please retry.",
      recoverable: true
    };
  }

  return {
    code: "subscribe_failed",
    message: message || "Push subscription failed.",
    recoverable: true
  };
}

async function persistSubscription(subscription: PushSubscription): Promise<{ ok: boolean; status: number; error?: string }> {
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription.toJSON())
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: payload?.error ?? "Failed to store push subscription"
    };
  }

  return { ok: true, status: response.status };
}

export async function subscribeToPush(): Promise<PushSubscribeResult> {
  const support = getPushSupportInfo();
  if (!support.supported) {
    return {
      success: false,
      code: support.code,
      message: support.message ?? "Web Push is unavailable.",
      recoverable: false,
      unsupported: support.unsupported
    };
  }

  if (Notification.permission === "denied") {
    return {
      success: false,
      code: "permission_denied",
      message: "Notification permission denied. Enable notifications in your browser settings.",
      recoverable: true,
      unsupported: false
    };
  }

  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) {
    return {
      success: false,
      code: "vapid_missing",
      message: "Server configuration missing for Web Push.",
      recoverable: false,
      unsupported: false
    };
  }

  try {
    let registration: ServiceWorkerRegistration;
    try {
      registration = await navigator.serviceWorker.register("/sw.js", {
        updateViaCache: "none"
      });
      await navigator.serviceWorker.ready;
    } catch (error) {
      const err = error as { name?: string; message?: string };
      if (process.env.NODE_ENV === "development") {
        console.error("[push registration] failure", {
          name: err?.name ?? "Error",
          message: err?.message ?? "Unknown service worker registration error"
        });
      }
      return {
        success: false,
        code: "registration_failed",
        message: "Failed to register service worker for push notifications.",
        recoverable: true,
        unsupported: false
      };
    }

    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      const persistedExisting = await persistSubscription(existing);
      if (!persistedExisting.ok) {
        return {
          success: false,
          code: "backend_failed",
          message: persistedExisting.error ?? "Failed to save push subscription.",
          recoverable: true,
          unsupported: false
        };
      }

      return {
        success: true,
        code: "already_subscribed",
        message: "Web Push is already active on this device."
      };
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return {
        success: false,
        code: "permission_denied",
        message: "Notification permission denied. Enable notifications to use Web Push.",
        recoverable: true,
        unsupported: false
      };
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey)
    });

    const persisted = await persistSubscription(subscription);
    if (!persisted.ok) {
      return {
        success: false,
        code: "backend_failed",
        message: persisted.error ?? "Failed to save push subscription.",
        recoverable: true,
        unsupported: false
      };
    }

    return {
      success: true,
      code: "subscribed",
      message: "Web Push enabled on this device."
    };
  } catch (error) {
    const mapped = toUserFacingPushError(error);
    return {
      success: false,
      code: mapped.code,
      message: mapped.message,
      recoverable: mapped.recoverable,
      unsupported: false
    };
  }
}

export async function checkPushActive(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const support = getPushSupportInfo();
  if (!support.supported) return false;

  try {
    const registration = await navigator.serviceWorker.getRegistration("/sw.js");
    if (!registration) return false;
    const subscription = await registration.pushManager.getSubscription();
    return Boolean(subscription);
  } catch {
    return false;
  }
}
