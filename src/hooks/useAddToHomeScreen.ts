"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_KEYS = {
  dismissedUntil: "a2hs_dismissed_until",
  neverShow: "a2hs_never_show",
  installed: "a2hs_installed"
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const IOS_BROWSER_EXCLUSIONS = /crios|fxios|edgios|opios|mercury/i;

type InstallPromptTelemetryEvent = "shown" | "dismissed" | "clicked_install" | "installed";

interface DeferredInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function readBooleanStorage(key: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeBooleanStorage(key: string, value: boolean) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage write failures in private mode/limited environments.
  }
}

function readNumberStorage(key: string): number {
  if (typeof window === "undefined") return 0;

  try {
    const value = window.localStorage.getItem(key);
    if (!value) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function writeNumberStorage(key: string, value: number) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage write failures in private mode/limited environments.
  }
}

function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;

  const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return window.matchMedia("(display-mode: standalone)").matches || iosStandalone;
}

function isIosSafariBrowser(): boolean {
  if (typeof window === "undefined") return false;

  const userAgent = window.navigator.userAgent;
  const isIosDevice =
    /iphone|ipad|ipod/i.test(userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  const isSafari = /safari/i.test(userAgent) && !IOS_BROWSER_EXCLUSIONS.test(userAgent);

  return isIosDevice && isSafari;
}

function canRegisterServiceWorker(): boolean {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  if (window.isSecureContext) return true;

  const hostname = window.location.hostname;
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function sendInstallPromptTelemetry(event: InstallPromptTelemetryEvent) {
  if (typeof window === "undefined") return;

  void fetch("/api/telemetry/install_prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event,
      timestamp: new Date().toISOString()
    }),
    keepalive: true
  }).catch(() => {
    // Telemetry should never block the install prompt UI.
  });
}

function addDisplayModeListener(
  mediaQuery: MediaQueryList,
  listener: (event: MediaQueryListEvent) => void
) {
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }

  const legacyListener = listener as unknown as (this: MediaQueryList, event: MediaQueryListEvent) => void;
  mediaQuery.addListener(legacyListener);
  return () => mediaQuery.removeListener(legacyListener);
}

export type UseAddToHomeScreenResult = {
  shouldShow: boolean;
  isIOS: boolean;
  canPrompt: boolean;
  promptInstall: () => Promise<boolean>;
  dismiss: (days?: number) => void;
  neverShow: () => void;
};

export function useAddToHomeScreen(): UseAddToHomeScreenResult {
  const [isReady, setIsReady] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissedUntil, setDismissedUntil] = useState(0);
  const [neverShowPreference, setNeverShowPreference] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPromptEvent | null>(null);
  const hasTrackedShown = useRef(false);

  const canPrompt = Boolean(deferredPrompt);

  const applyDismissUntil = useCallback((untilMs: number) => {
    writeNumberStorage(STORAGE_KEYS.dismissedUntil, untilMs);
    setDismissedUntil(untilMs);
    sendInstallPromptTelemetry("dismissed");
  }, []);

  const dismiss = useCallback(
    (days = 7) => {
      const safeDays = Number.isFinite(days) ? Math.max(days, 1) : 7;
      applyDismissUntil(Date.now() + safeDays * DAY_MS);
    },
    [applyDismissUntil]
  );

  const neverShow = useCallback(() => {
    writeBooleanStorage(STORAGE_KEYS.neverShow, true);
    setNeverShowPreference(true);
    sendInstallPromptTelemetry("dismissed");
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return false;

    sendInstallPromptTelemetry("clicked_install");
    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;

      if (choice.outcome === "dismissed") {
        applyDismissUntil(Date.now() + 7 * DAY_MS);
        return false;
      }

      return true;
    } catch {
      return false;
    } finally {
      setDeferredPrompt(null);
    }
  }, [applyDismissUntil, deferredPrompt]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const standalone = isStandaloneMode();
    const installedFlag = readBooleanStorage(STORAGE_KEYS.installed) || standalone;
    const neverShowFlag = readBooleanStorage(STORAGE_KEYS.neverShow);
    const dismissedUntilMs = readNumberStorage(STORAGE_KEYS.dismissedUntil);

    setIsIOS(isIosSafariBrowser());
    setIsStandalone(standalone);
    setInstalled(installedFlag);
    setNeverShowPreference(neverShowFlag);
    setDismissedUntil(dismissedUntilMs);

    if (installedFlag) {
      writeBooleanStorage(STORAGE_KEYS.installed, true);
    }

    setIsReady(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const displayModeMedia = window.matchMedia("(display-mode: standalone)");
    const stopListening = addDisplayModeListener(displayModeMedia, (event) => {
      setIsStandalone(event.matches);
      if (event.matches) {
        writeBooleanStorage(STORAGE_KEYS.installed, true);
        setInstalled(true);
        setDeferredPrompt(null);
      }
    });

    return stopListening;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // iOS Safari does not emit `beforeinstallprompt`; we show manual instructions there.
    const handleBeforeInstallPrompt = (event: Event) => {
      const promptEvent = event as DeferredInstallPromptEvent;
      promptEvent.preventDefault();
      setDeferredPrompt(promptEvent);
    };

    const handleAppInstalled = () => {
      writeBooleanStorage(STORAGE_KEYS.installed, true);
      setInstalled(true);
      setDeferredPrompt(null);
      sendInstallPromptTelemetry("installed");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!canRegisterServiceWorker()) return;

    void (async () => {
      try {
        const existingRegistration = await navigator.serviceWorker.getRegistration("/sw.js");
        if (!existingRegistration) {
          await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
        }
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[a2hs] service worker registration failed", error);
        }
      }
    })();
  }, []);

  const shouldShow = useMemo(() => {
    if (!isReady) return false;
    if (installed || isStandalone || neverShowPreference) return false;
    if (dismissedUntil > Date.now()) return false;

    return isIOS || canPrompt;
  }, [canPrompt, dismissedUntil, installed, isIOS, isReady, isStandalone, neverShowPreference]);

  useEffect(() => {
    if (!shouldShow) {
      hasTrackedShown.current = false;
      return;
    }

    if (hasTrackedShown.current) return;
    hasTrackedShown.current = true;
    sendInstallPromptTelemetry("shown");
  }, [shouldShow]);

  return {
    shouldShow,
    isIOS,
    canPrompt,
    promptInstall,
    dismiss,
    neverShow
  };
}
