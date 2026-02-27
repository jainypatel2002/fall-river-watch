"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useNotificationSettingsMutation, useNotificationSettingsQuery } from "@/lib/queries/reports";
import { INCIDENT_CATEGORIES } from "@/lib/utils/constants";
import { prettyCategory } from "@/lib/utils/format";

export function NotificationSettingsForm() {
  const settingsQuery = useNotificationSettingsQuery();
  const mutation = useNotificationSettingsMutation();

  const [enabled, setEnabled] = useState(true);
  const [channels, setChannels] = useState<string[]>(["email"]);
  const [radiusMiles, setRadiusMiles] = useState(3);
  const [categories, setCategories] = useState<string[]>([...INCIDENT_CATEGORIES]);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("07:00");

  useEffect(() => {
    const settings = settingsQuery.data?.settings;
    if (!settings) return;

    setEnabled(settings.enabled);
    setChannels(settings.channels);
    setRadiusMiles(settings.radius_miles);
    setCategories(settings.categories);
    setQuietStart(settings.quiet_hours.start);
    setQuietEnd(settings.quiet_hours.end);
  }, [settingsQuery.data?.settings]);

  function toggleCategory(category: string) {
    setCategories((prev) => {
      if (prev.includes(category)) {
        const next = prev.filter((item) => item !== category);
        return next.length ? next : [...INCIDENT_CATEGORIES];
      }
      return [...prev, category];
    });
  }

  async function save() {
    try {
      await mutation.mutateAsync({
        channels: channels as Array<"email" | "web_push">,
        radius_miles: radiusMiles,
        categories: categories as Array<(typeof INCIDENT_CATEGORIES)[number]>,
        quiet_hours: {
          start: quietStart,
          end: quietEnd
        },
        enabled
      });
      toast.success("Notification preferences saved");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle style={{ fontFamily: "var(--font-heading)" }}>Notifications (Scaffold)</CardTitle>
        <CardDescription>Email and web push delivery providers are intentionally stubbed for MVP.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 p-3">
          <div>
            <Label>Enable notifications</Label>
            <p className="text-xs text-zinc-600">Turn all incident alerts on/off.</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-2">
          <Label>Channels</Label>
          <div className="flex gap-2">
            {[
              { id: "email", label: "Email" },
              { id: "web_push", label: "Web Push" }
            ].map((channel) => {
              const active = channels.includes(channel.id);
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => {
                    setChannels((prev) => {
                      if (prev.includes(channel.id)) {
                        const next = prev.filter((item) => item !== channel.id);
                        return next.length ? next : ["email"];
                      }
                      return [...prev, channel.id];
                    });
                  }}
                  className={`rounded-md border px-3 py-1.5 text-sm ${active ? "border-emerald-600 bg-emerald-50" : "border-zinc-300"}`}
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
            value={radiusMiles}
            onChange={(event) => setRadiusMiles(Number(event.target.value))}
          />
        </div>

        <div className="space-y-2">
          <Label>Categories</Label>
          <div className="flex flex-wrap gap-2">
            {INCIDENT_CATEGORIES.map((category) => {
              const selected = categories.includes(category);
              return (
                <button
                  key={category}
                  type="button"
                  onClick={() => toggleCategory(category)}
                  className={`rounded-full border px-3 py-1 text-xs ${selected ? "border-emerald-600 bg-emerald-600 text-white" : "border-zinc-300"}`}
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
            <Input id="quiet-start" type="time" value={quietStart} onChange={(event) => setQuietStart(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="quiet-end">Quiet hours end</Label>
            <Input id="quiet-end" type="time" value={quietEnd} onChange={(event) => setQuietEnd(event.target.value)} />
          </div>
        </div>

        <Button onClick={save} disabled={mutation.isPending}>
          Save preferences
        </Button>
      </CardContent>
    </Card>
  );
}
