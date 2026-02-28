"use client";

import { useState, useMemo, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUiToast } from "@/hooks/use-ui-toast";
import { useNotificationSettingsMutation, useNotificationSettingsQuery } from "@/lib/queries/reports";
import { type NotificationSettingsInput } from "@/lib/schemas/report";
import { INCIDENT_CATEGORIES } from "@/lib/utils/constants";
import { prettyCategory } from "@/lib/utils/format";
import { subscribeToPush, checkPushActive } from "@/lib/push/subscribe";
import { useUiStore } from "@/lib/store/ui-store";
import { normalizeTo24HourHHMM } from "@/lib/time/normalizeQuietHours";

const defaultSettings: NotificationSettingsInput = {
  channels: ["email"],
  radius_miles: 3,
  categories: [...INCIDENT_CATEGORIES],
  quiet_hours: {
    start: "22:00",
    end: "07:00"
  },
  enabled: true
};

export function NotificationSettingsForm() {
  const settingsQuery = useNotificationSettingsQuery();
  const mutation = useNotificationSettingsMutation();
  const uiToast = useUiToast();
  const [draft, setDraft] = useState<NotificationSettingsInput | null>(null);
  const [pushStatusMsg, setPushStatusMsg] = useState("");
  const [serverConfig, setServerConfig] = useState<{ emailConfigured: boolean; pushConfigured: boolean } | null>(null);
  const userLocation = useUiStore((state) => state.userLocation);

  useEffect(() => {
    fetch("/api/notifications/config")
      .then(res => res.json())
      .then(data => setServerConfig(data))
      .catch(console.error);
  }, []);

  const persisted = useMemo(() => {
    if (!settingsQuery.data?.settings) return null;
    const s = { ...settingsQuery.data.settings };
    if (s.quiet_hours) {
      s.quiet_hours = {
        start: normalizeTo24HourHHMM(s.quiet_hours.start) ?? "22:00",
        end: normalizeTo24HourHHMM(s.quiet_hours.end) ?? "07:00",
      };
    }
    return s;
  }, [settingsQuery.data?.settings]);

  const settings = draft ?? persisted ?? defaultSettings;

  function updateDraft(mutator: (current: NotificationSettingsInput) => NotificationSettingsInput) {
    setDraft((previous) => mutator(previous ?? persisted ?? defaultSettings));
  }

  async function save() {
    let finalSettings: NotificationSettingsInput = { ...settings };

    const start24 = normalizeTo24HourHHMM(finalSettings.quiet_hours.start);
    const end24 = normalizeTo24HourHHMM(finalSettings.quiet_hours.end);

    if (!start24 || !end24) {
      uiToast.error("Invalid time. Please use a valid time.");
      return;
    }

    finalSettings.quiet_hours = {
      start: start24,
      end: end24
    };

    // Automatically inject the latest timezone to be accurate for quiet hours
    finalSettings.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Capture user's approximate location if available so Haversine dispatcher works.
    if (userLocation && !finalSettings.center_lat) {
      finalSettings.center_lat = userLocation.lat;
      finalSettings.center_lng = userLocation.lng;
    }

    // Process push subscription logic if active and channels specifically requested Web Push
    if (finalSettings.enabled && finalSettings.channels.includes("web_push")) {
      const sub = await subscribeToPush();
      if (!sub.success) {
        setPushStatusMsg(sub.message || "Push inactive");
        if (sub.message !== "Server configuration missing.") {
          uiToast.error(`Web Push issue: ${sub.message}`);
        }
      } else {
        setPushStatusMsg("Active on this device");
      }
    }

    try {
      await mutation.mutateAsync(finalSettings);
      uiToast.success("Notification preferences saved");
      setDraft(null);
    } catch (error) {
      uiToast.error((error as Error).message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ fontFamily: "var(--font-heading)" }}>Notifications</CardTitle>
        <CardDescription>
          Configure how and when you receive critical alerts locally.
          {serverConfig && !serverConfig.emailConfigured && !serverConfig.pushConfigured && (
            <span className="block mt-2 text-xs font-medium text-destructive">Server configuration missing. Notifications may not deliver.</span>
          )}
          {pushStatusMsg && (
            <span className="block mt-2 text-xs font-medium text-amber-500">{pushStatusMsg}</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.72)] p-3">
          <div>
            <Label>Enable notifications</Label>
            <p className="text-xs text-[color:var(--muted)]">Turn all incident alerts on/off.</p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(next) => updateDraft((current) => ({ ...current, enabled: next }))}
          />
        </div>

        <div className="space-y-2">
          <Label>Channels</Label>
          <div className="flex gap-2">
            {[
              { id: "email", label: "Email" },
              { id: "web_push", label: "Web Push" }
            ].map((channel) => {
              const active = settings.channels.includes(channel.id as "email" | "web_push");
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => {
                    updateDraft((current) => {
                      if (current.channels.includes(channel.id as "email" | "web_push")) {
                        const next = current.channels.filter((item) => item !== channel.id);
                        return { ...current, channels: next.length ? next : ["email"] };
                      }
                      return { ...current, channels: [...current.channels, channel.id as "email" | "web_push"] };
                    });
                  }}
                  className={`rounded-xl border px-3 py-1.5 text-sm ${active
                    ? "border-[rgba(34,211,238,0.6)] bg-[rgba(34,211,238,0.15)] text-[var(--fg)]"
                    : "border-[var(--border)] bg-[rgba(10,15,28,0.72)] text-[color:var(--muted)]"
                    }`}
                >
                  {channel.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="radius">Alert radius (miles)</Label>
          <Input
            id="radius"
            type="number"
            min={0.5}
            max={25}
            step={0.5}
            value={settings.radius_miles}
            onChange={(event) => updateDraft((current) => ({ ...current, radius_miles: Number(event.target.value) }))}
          />
        </div>

        <div className="space-y-2">
          <Label>Categories</Label>
          <div className="flex flex-wrap gap-2">
            {INCIDENT_CATEGORIES.map((category) => {
              const selected = settings.categories.includes(category);
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() =>
                    updateDraft((current) => {
                      if (current.categories.includes(category)) {
                        const next = current.categories.filter((item) => item !== category);
                        return { ...current, categories: next.length ? next : [...INCIDENT_CATEGORIES] };
                      }
                      return { ...current, categories: [...current.categories, category] };
                    })
                  }
                  className={`rounded-full border px-3 py-1 text-xs ${selected
                    ? "border-[rgba(34,211,238,0.6)] bg-[rgba(34,211,238,0.15)] text-[var(--fg)]"
                    : "border-[var(--border)] bg-[rgba(10,15,28,0.72)] text-[color:var(--muted)]"
                    }`}
                >
                  {prettyCategory(category)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="quiet-start">Quiet hours start</Label>
            <Input
              id="quiet-start"
              type="time"
              value={settings.quiet_hours.start}
              onChange={(event) =>
                updateDraft((current) => ({ ...current, quiet_hours: { ...current.quiet_hours, start: event.target.value } }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quiet-end">Quiet hours end</Label>
            <Input
              id="quiet-end"
              type="time"
              value={settings.quiet_hours.end}
              onChange={(event) =>
                updateDraft((current) => ({ ...current, quiet_hours: { ...current.quiet_hours, end: event.target.value } }))
              }
            />
          </div>
        </div>

        <Button onClick={save} disabled={mutation.isPending}>
          Save Preferences
        </Button>
      </CardContent>
    </Card>
  );
}
