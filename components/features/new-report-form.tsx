"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Camera, ChevronLeft, ChevronRight, LoaderCircle, LocateFixed, TriangleAlert } from "lucide-react";
import { z } from "zod";
import { LocationSearch } from "@/components/map/LocationSearch";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSupabaseBrowser } from "@/hooks/use-supabase-browser";
import { useUiToast } from "@/hooks/use-ui-toast";
import { INCIDENT_VERIFY_CONFIRM_THRESHOLD } from "@/lib/constants";
import { useCreateReportMutation } from "@/lib/queries/reports";
import { createReportSchema, type CreateReportInput } from "@/lib/schemas/report";
import { metersToMiles, milesToMeters } from "@/lib/utils/geo";
import { INCIDENT_CATEGORIES } from "@/lib/utils/constants";
import { prettyCategory } from "@/lib/utils/format";

const DEFAULT_REPORT_LOCATION = { lat: 41.7001, lng: -71.155 };
const DANGER_RADIUS_MIN_MILES = 0.1;
const DANGER_RADIUS_MAX_MILES = Number(metersToMiles(5000).toFixed(2));
const DANGER_RADIUS_STEP_MILES = 0.1;

const LocationPickerMap = dynamic(() => import("@/components/map/location-picker-map"), {
  ssr: false,
  loading: () => <div className="shimmer h-72 rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.78)]" />
});

const steps = [
  { id: 1, title: "Incident", helper: "What happened?" },
  { id: 2, title: "Location", helper: "Where did it happen?" },
  { id: 3, title: "Media", helper: "Evidence + submit" }
] as const;

type CreateReportFormValues = z.input<typeof createReportSchema>;

type ReportLocation = {
  lat: number;
  lng: number;
};

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 90);
}

function isValidReportLocation(location: ReportLocation | null): location is ReportLocation {
  if (!location) return false;
  return Number.isFinite(location.lat) && Number.isFinite(location.lng);
}

export function NewReportForm() {
  const router = useRouter();
  const supabase = useSupabaseBrowser();
  const createMutation = useCreateReportMutation();
  const uiToast = useUiToast();

  const [step, setStep] = useState<(typeof steps)[number]["id"]>(1);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [locationSearchQuery, setLocationSearchQuery] = useState("");
  const [selectedReportLocation, setSelectedReportLocation] = useState<ReportLocation | null>(DEFAULT_REPORT_LOCATION);
  const [reportMapCenter, setReportMapCenter] = useState<ReportLocation>(DEFAULT_REPORT_LOCATION);
  const [isLocating, setIsLocating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [dangerRadiusEnabled, setDangerRadiusEnabled] = useState(false);
  const [dangerRadiusMiles, setDangerRadiusMiles] = useState(0.5);

  const form = useForm<CreateReportFormValues>({
    resolver: zodResolver(createReportSchema),
    defaultValues: {
      category: "road_hazard",
      severity: 3,
      title: "",
      description: "",
      location: DEFAULT_REPORT_LOCATION,
      is_anonymous: false,
      danger_radius_meters: null,
      danger_center_lat: null,
      danger_center_lng: null,
      mediaPaths: []
    }
  });

  const isSuspicious = form.watch("category") === "suspicious_activity";
  const descriptionLength = form.watch("description")?.length ?? 0;
  const locationFormError = form.formState.errors.location?.message ?? form.formState.errors.location?.lat?.message;
  const locationError = locationFormError ?? (!selectedReportLocation ? "Select a location to continue." : undefined);

  const setReportLocation = useCallback(
    (next: ReportLocation, options?: { shouldDirty?: boolean }) => {
      if (!Number.isFinite(next.lat) || !Number.isFinite(next.lng)) return;

      setSelectedReportLocation(next);
      setReportMapCenter(next);
      form.clearErrors("location");
      form.setValue("location", next, {
        shouldDirty: options?.shouldDirty ?? true,
        shouldValidate: true
      });

      if (dangerRadiusEnabled) {
        form.setValue("danger_center_lat", next.lat, { shouldDirty: true, shouldValidate: false });
        form.setValue("danger_center_lng", next.lng, { shouldDirty: true, shouldValidate: false });
      }
    },
    [dangerRadiusEnabled, form]
  );

  useEffect(() => {
    if (!("geolocation" in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setReportLocation(
          {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          },
          { shouldDirty: false }
        );
      },
      () => {
        // Keep default fallback coordinates.
      },
      { enableHighAccuracy: true, timeout: 8_000 }
    );
  }, [setReportLocation]);

  useEffect(() => {
    if (!dangerRadiusEnabled) {
      form.setValue("danger_radius_meters", null, { shouldDirty: true, shouldValidate: false });
      form.setValue("danger_center_lat", null, { shouldDirty: true, shouldValidate: false });
      form.setValue("danger_center_lng", null, { shouldDirty: true, shouldValidate: false });
      return;
    }

    const clampedMiles = Math.max(DANGER_RADIUS_MIN_MILES, Math.min(DANGER_RADIUS_MAX_MILES, dangerRadiusMiles));
    const radiusMeters = Math.round(milesToMeters(clampedMiles));
    const center = selectedReportLocation ?? reportMapCenter;

    form.setValue("danger_radius_meters", radiusMeters, { shouldDirty: true, shouldValidate: false });
    form.setValue("danger_center_lat", center.lat, { shouldDirty: true, shouldValidate: false });
    form.setValue("danger_center_lng", center.lng, { shouldDirty: true, shouldValidate: false });
  }, [dangerRadiusEnabled, dangerRadiusMiles, form, reportMapCenter, selectedReportLocation]);

  const previewUrls = useMemo(() => selectedFiles.map((file) => URL.createObjectURL(file)), [selectedFiles]);

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  async function goToNextStep() {
    const stepValidation: Record<number, Array<"category" | "severity" | "title" | "description" | "location">> = {
      1: ["category", "severity", "title", "description"],
      2: ["location"],
      3: []
    };

    if (step === 2 && !isValidReportLocation(selectedReportLocation)) {
      form.setError("location", { type: "manual", message: "Select a location to continue." });
      return;
    }

    const valid = await form.trigger(stepValidation[step], { shouldFocus: true });
    if (!valid) return;
    if (step < 3) setStep((prev) => (prev + 1) as 1 | 2 | 3);
  }

  function handleUseMyLocation() {
    if (!("geolocation" in navigator)) {
      uiToast.info("Geolocation unavailable", "Search for a location instead.");
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setReportLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        setLocationSearchQuery("");
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
        uiToast.info("Location access denied", "Search still works if location permission is denied.");
      },
      { enableHighAccuracy: true, timeout: 8_000 }
    );
  }

  async function finalSubmitReport() {
    if (step !== 3) return;
    if (isSubmitting || createMutation.isPending) return;
    setIsSubmitting(true);
    let mediaPaths: string[] = [];

    try {
      if (!isValidReportLocation(selectedReportLocation)) {
        form.setError("location", { type: "manual", message: "Select a location to continue." });
        setStep(2);
        return;
      }

      const valid = await form.trigger(["category", "severity", "title", "description", "location"], { shouldFocus: true });
      if (!valid) return;

      const values = form.getValues();
      const parsed = createReportSchema.parse(values);
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        uiToast.error("Please sign in to submit a report");
        router.push("/auth");
        return;
      }

      if (!values.location) {
        uiToast.error("Location is required");
        return;
      }

      const reportId = crypto.randomUUID();

      for (const file of selectedFiles) {
        const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const fileName = sanitizeFileName(`${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
        const path = `${user.id}/${reportId}/${fileName}`;

        const { error } = await supabase.storage.from("report-media").upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type
        });

        if (error) {
          throw new Error(error.message);
        }

        mediaPaths.push(path);
      }

      const result = await createMutation.mutateAsync({
        ...parsed,
        id: reportId,
        mediaPaths
      });

      uiToast.success("Report submitted");
      router.push(`/report/${result.id}`);
      router.refresh();
    } catch (error) {
      if (mediaPaths.length) {
        await supabase.storage.from("report-media").remove(mediaPaths);
      }
      uiToast.error(error instanceof Error ? error.message : "Failed to submit report");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div>
          <CardTitle style={{ fontFamily: "var(--font-heading)" }}>Create Report</CardTitle>
          <CardDescription>
            Reports expire after 24h unless they reach {INCIDENT_VERIFY_CONFIRM_THRESHOLD} community confirms.
          </CardDescription>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {steps.map((item) => {
            const active = step === item.id;
            const complete = step > item.id;
            return (
              <div
                key={item.id}
                className={`rounded-xl border p-2 text-xs ${
                  active
                    ? "border-[rgba(34,211,238,0.6)] bg-[rgba(34,211,238,0.15)]"
                    : complete
                      ? "border-[rgba(34,211,238,0.35)] bg-[rgba(34,211,238,0.08)]"
                      : "border-[var(--border)] bg-[rgba(11,16,29,0.7)] text-[color:var(--muted)]"
                }`}
              >
                <p className="font-semibold">Step {item.id}</p>
                <p>{item.title}</p>
                <p className="text-[11px] opacity-80">{item.helper}</p>
              </div>
            );
          })}
        </div>
      </CardHeader>

      <CardContent className="pb-[max(env(safe-area-inset-bottom),1.25rem)]">
        <form className="space-y-5" onSubmit={(event) => event.preventDefault()}>
          {step === 1 ? (
            <div className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select
                    value={form.watch("category")}
                    onValueChange={(value) => form.setValue("category", value as CreateReportInput["category"], { shouldValidate: true })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {INCIDENT_CATEGORIES.map((category) => (
                        <SelectItem key={category} value={category}>
                          {prettyCategory(category)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.category ? (
                    <p className="text-xs text-rose-300">{form.formState.errors.category.message}</p>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <Label>Severity (1-5)</Label>
                  <Select
                    value={String(form.watch("severity"))}
                    onValueChange={(value) => form.setValue("severity", Number(value), { shouldValidate: true })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Severity" />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((level) => (
                        <SelectItem key={level} value={String(level)}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.severity ? (
                    <p className="text-xs text-rose-300">{form.formState.errors.severity.message}</p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Title (optional)</Label>
                <Input id="title" placeholder="Brief summary" {...form.register("title")} />
                {form.formState.errors.title ? <p className="text-xs text-rose-300">{form.formState.errors.title.message}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea id="description" placeholder="Describe what happened, where, and when." {...form.register("description")} />
                <p className="text-xs text-[color:var(--muted)]">{descriptionLength}/500</p>
                {isSuspicious ? (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-100">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5" />
                    Suspicious activity reports cannot include phone numbers or street addresses.
                  </div>
                ) : null}
                {form.formState.errors.description ? <p className="text-xs text-rose-300">{form.formState.errors.description.message}</p> : null}
              </div>

              <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[rgba(11,16,29,0.72)] p-3">
                <div>
                  <Label htmlFor="anonymous-toggle">Post anonymously</Label>
                  <p className="text-xs text-[color:var(--muted)]">Public views will show Anonymous, but moderation still keeps your account ID.</p>
                </div>
                <Switch
                  id="anonymous-toggle"
                  checked={Boolean(form.watch("is_anonymous"))}
                  onCheckedChange={(value) => form.setValue("is_anonymous", value, { shouldDirty: true, shouldValidate: false })}
                />
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                <Label>Location</Label>
                <Button type="button" variant="outline" size="sm" className="min-h-11 gap-1.5" onClick={handleUseMyLocation} disabled={isLocating}>
                  {isLocating ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
                  Use my location
                </Button>
              </div>

              <LocationSearch
                value={locationSearchQuery}
                onChange={setLocationSearchQuery}
                onSelectLocation={({ lat, lng, label }) => {
                  setReportLocation({ lat, lng });
                  setLocationSearchQuery(label);
                }}
                getProximity={() => selectedReportLocation ?? reportMapCenter}
                placeholder="Search location"
                className="z-[90]"
              />

              <div className="space-y-2">
                <Label>Map (drag pin to adjust)</Label>
                <LocationPickerMap
                  selectedLocation={selectedReportLocation}
                  dangerRadiusMeters={form.watch("danger_radius_meters")}
                  onLocationChange={(next) => setReportLocation(next)}
                  onCenterChange={setReportMapCenter}
                />
                <p className="text-xs text-[color:var(--muted)]">
                  {selectedReportLocation
                    ? `Selected: ${selectedReportLocation.lat.toFixed(5)}, ${selectedReportLocation.lng.toFixed(5)}`
                    : "Selected: No location yet"}
                </p>
                {locationError ? <p className="text-xs text-rose-300">{locationError}</p> : null}
              </div>

              <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.72)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <Label htmlFor="danger-radius-toggle">Danger radius</Label>
                    <p className="text-xs text-[color:var(--muted)]">Optional impact area around the incident pin.</p>
                  </div>
                  <Switch id="danger-radius-toggle" checked={dangerRadiusEnabled} onCheckedChange={setDangerRadiusEnabled} />
                </div>

                {dangerRadiusEnabled ? (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="danger-radius-slider" className="text-xs text-[color:var(--muted)]">
                        Radius ({dangerRadiusMiles.toFixed(1)} mi)
                      </Label>
                      <input
                        id="danger-radius-slider"
                        type="range"
                        min={DANGER_RADIUS_MIN_MILES}
                        max={DANGER_RADIUS_MAX_MILES}
                        step={DANGER_RADIUS_STEP_MILES}
                        value={dangerRadiusMiles}
                        onChange={(event) => setDangerRadiusMiles(Number(event.target.value))}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="danger-radius-input" className="text-xs text-[color:var(--muted)]">
                        Radius (miles)
                      </Label>
                      <Input
                        id="danger-radius-input"
                        type="number"
                        min={DANGER_RADIUS_MIN_MILES}
                        max={DANGER_RADIUS_MAX_MILES}
                        step={DANGER_RADIUS_STEP_MILES}
                        value={dangerRadiusMiles}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          if (!Number.isFinite(next)) return;
                          setDangerRadiusMiles(Math.max(DANGER_RADIUS_MIN_MILES, Math.min(DANGER_RADIUS_MAX_MILES, next)));
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="media">Photos (optional, image only)</Label>
                <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[rgba(10,15,28,0.6)] p-3">
                  <label htmlFor="media" className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-[var(--fg)]">
                    <Camera className="h-4 w-4" />
                    Select up to 3 images
                  </label>
                  <input
                    id="media"
                    type="file"
                    accept="image/*"
                    multiple
                    className="mt-2 block w-full text-sm text-[color:var(--muted)]"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? [])
                        .filter((file) => file.type.startsWith("image/"))
                        .slice(0, 3);
                      setSelectedFiles(files);
                    }}
                  />

                  {previewUrls.length ? (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {previewUrls.map((url, index) => (
                        <img key={url} src={url} alt={`upload-preview-${index + 1}`} className="h-20 w-full rounded-lg object-cover" />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[rgba(10,15,28,0.72)] p-3 text-sm text-[color:var(--muted)]">
                <p className="font-medium text-[var(--fg)]">Ready to submit</p>
                <p>Category: {prettyCategory(form.getValues("category"))}</p>
                <p>Severity: {form.getValues("severity")}</p>
                <p>Anonymous: {form.getValues("is_anonymous") ? "Yes" : "No"}</p>
                <p>Danger radius: {form.getValues("danger_radius_meters") ? `${metersToMiles(form.getValues("danger_radius_meters") ?? 0).toFixed(1)} mi` : "None"}</p>
                <p>Photos: {selectedFiles.length}</p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="ghost" className="min-h-11 w-full gap-1.5 sm:w-auto" onClick={() => setStep((prev) => Math.max(1, prev - 1) as 1 | 2 | 3)} disabled={step === 1}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>

            {step < 3 ? (
              <Button
                key="continue-step"
                type="button"
                className="min-h-11 w-full gap-1.5 sm:w-auto"
                onClick={(event) => {
                  event.preventDefault();
                  void goToNextStep();
                }}
                disabled={step === 2 && !isValidReportLocation(selectedReportLocation)}
              >
                Continue
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                key="submit-report"
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  void finalSubmitReport();
                }}
                disabled={createMutation.isPending || isSubmitting}
                className="min-h-11 w-full gap-2 sm:w-auto"
              >
                {createMutation.isPending || isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                Submit Report
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
