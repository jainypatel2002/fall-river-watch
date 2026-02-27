"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Camera, ChevronLeft, ChevronRight, LoaderCircle, TriangleAlert } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSupabaseBrowser } from "@/hooks/use-supabase-browser";
import { useUiToast } from "@/hooks/use-ui-toast";
import { useCreateReportMutation } from "@/lib/queries/reports";
import { createReportSchema, type CreateReportInput } from "@/lib/schemas/report";
import { INCIDENT_CATEGORIES } from "@/lib/utils/constants";
import { prettyCategory } from "@/lib/utils/format";

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

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 90);
}

export function NewReportForm() {
  const router = useRouter();
  const supabase = useSupabaseBrowser();
  const createMutation = useCreateReportMutation();
  const uiToast = useUiToast();

  const [step, setStep] = useState<(typeof steps)[number]["id"]>(1);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const form = useForm<CreateReportFormValues>({
    resolver: zodResolver(createReportSchema),
    defaultValues: {
      category: "road_hazard",
      severity: 3,
      title: "",
      description: "",
      location: { lat: 41.7001, lng: -71.155 },
      mediaPaths: []
    }
  });

  const currentLocation = form.watch("location");
  const isSuspicious = form.watch("category") === "suspicious_activity";
  const descriptionLength = form.watch("description")?.length ?? 0;
  const locationError = form.formState.errors.location?.message ?? form.formState.errors.location?.lat?.message;

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (position) => {
        form.setValue("location", {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      () => {
        // Keep default fallback coordinates.
      },
      { enableHighAccuracy: true, timeout: 8_000 }
    );
  }, [form]);

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
    const valid = await form.trigger(stepValidation[step], { shouldFocus: true });
    if (!valid) return;
    if (step < 3) setStep((prev) => (prev + 1) as 1 | 2 | 3);
  }

  async function onSubmit(values: CreateReportFormValues) {
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
    const mediaPaths: string[] = [];

    try {
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
    }
  }

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div>
          <CardTitle style={{ fontFamily: "var(--font-heading)" }}>Create Report</CardTitle>
          <CardDescription>Reports expire after 24h unless community verification thresholds are reached.</CardDescription>
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

      <CardContent>
        <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
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
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Location (drag pin to adjust)</Label>
                <LocationPickerMap
                  value={currentLocation}
                  onChange={(next) => form.setValue("location", next, { shouldDirty: true, shouldValidate: true })}
                />
                <p className="text-xs text-[color:var(--muted)]">
                  Selected: {currentLocation.lat.toFixed(5)}, {currentLocation.lng.toFixed(5)}
                </p>
                {locationError ? <p className="text-xs text-rose-300">{locationError}</p> : null}
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
                <p>Photos: {selectedFiles.length}</p>
              </div>
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="ghost" className="gap-1.5" onClick={() => setStep((prev) => Math.max(1, prev - 1) as 1 | 2 | 3)} disabled={step === 1}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>

            {step < 3 ? (
              <Button type="button" className="gap-1.5" onClick={goToNextStep}>
                Continue
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={createMutation.isPending} className="gap-2">
                {createMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                Submit Report
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
