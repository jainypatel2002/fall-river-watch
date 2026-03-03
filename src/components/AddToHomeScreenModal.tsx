"use client";

import Image from "next/image";
import { CheckCircle2, PlusSquare, Share } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAddToHomeScreen } from "@/src/hooks/useAddToHomeScreen";

const BENEFITS = ["Quick access", "Faster loading", "Alerts at a glance"];

export function AddToHomeScreenModal() {
  const { shouldShow, isIOS, canPrompt, promptInstall, dismiss, neverShow } = useAddToHomeScreen();
  const [showIosSteps, setShowIosSteps] = useState(false);
  const [isPrompting, setIsPrompting] = useState(false);

  if (!shouldShow) return null;

  async function handlePrimaryAction() {
    if (isIOS) {
      setShowIosSteps((prev) => !prev);
      return;
    }

    if (!canPrompt || isPrompting) return;

    setIsPrompting(true);
    try {
      await promptInstall();
    } finally {
      setIsPrompting(false);
    }
  }

  const primaryLabel = isIOS ? (showIosSteps ? "Hide steps" : "How to Add") : "Add to Home Screen";

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="a2hs-title">
      <div className="a2hs-fade-in absolute inset-0 bg-[rgba(2,6,13,0.72)] backdrop-blur-sm" />

      <section className="a2hs-pop-in relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[rgba(8,13,24,0.96)] p-5 shadow-[0_24px_55px_rgba(0,0,0,0.55)] sm:p-6">
        <div className="mb-4 flex items-center gap-3">
          <Image
            src="/icons/icon-192.png"
            alt="Fall River Alert app icon"
            width={40}
            height={40}
            className="h-10 w-10 rounded-xl border border-[rgba(34,211,238,0.45)]"
          />
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-[color:var(--muted)]">Install app</p>
            <h2 id="a2hs-title" className="text-lg font-semibold">
              Add Fall River Alert to your Home Screen
            </h2>
          </div>
        </div>

        <ul className="mb-4 space-y-2.5 text-sm">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-center gap-2 text-[var(--fg)]">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--primary)]" />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>

        {isIOS && showIosSteps ? (
          <div className="mb-4 rounded-xl border border-[var(--border)] bg-[rgba(8,12,20,0.6)] p-3.5 text-sm">
            {/* iOS Safari blocks the install prompt API, so installation is manual. */}
            <ol className="space-y-2 text-[color:var(--muted)]">
              <li className="flex items-start gap-2">
                <Share className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
                <span>Tap the Share button (square with an arrow).</span>
              </li>
              <li className="flex items-start gap-2">
                <PlusSquare className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
                <span>Choose &quot;Add to Home Screen&quot;.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--primary)]" />
                <span>Tap &quot;Add&quot; to finish.</span>
              </li>
            </ol>
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            type="button"
            onClick={() => void handlePrimaryAction()}
            disabled={!isIOS && (!canPrompt || isPrompting)}
            className="sm:col-span-2"
          >
            {isPrompting ? "Opening prompt..." : primaryLabel}
          </Button>
          <Button type="button" variant="outline" onClick={() => dismiss(7)}>
            Not now
          </Button>
          <Button type="button" variant="ghost" onClick={neverShow}>
            Don&apos;t show again
          </Button>
        </div>
      </section>
    </div>
  );
}
