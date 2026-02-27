"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Camera, LoaderCircle, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSupabaseBrowser } from "@/hooks/use-supabase-browser";
import { useCreateReportMutation } from "@/lib/queries/reports";
import { createReportSchema, type CreateReportInput } from "@/lib/schemas/report";
import { INCIDENT_CATEGORIES } from "@/lib/utils/constants";
import { prettyCategory } from "@/lib/utils/format";

const LocationPickerMap = dynamic(() => import("@/components/map/location-picker-map"), {
  ssr: false,
  loading: () => <div className="h-72 animate-pulse rounded-lg bg-zinc-200" />
});

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 90);
}

export function NewReportForm() {
  const router = useRouter();
  const supabase = useSupabaseBrowser();
  const createMutation = useCreateReportMutation();

  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const form = useForm<CreateReportInput>({
    resolver: zodResolver(createReportSchema),
    defaultValues: {
      category: "road_hazard",
      severity: 3,
      title: "",
      description: "",
      location: { lat: 40.7128, lng: -74.006 },
      mediaPaths: []
    }
  });

  const currentLocation = form.watch("location");
  const isSuspicious = form.watch("category") === "suspicious_activity";

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

  async function onSubmit(values: CreateReportInput) {
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Please sign in to create a report");
      router.push("/auth");
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
        ...values,
        id: reportId,
        mediaPaths
      });

      toast.success("Report submitted");
      router.push(`/report/${result.id}`);
      router.refresh();
    } catch (error) {
      if (mediaPaths.length) {
        await supabase.storage.from("report-media").remove(mediaPaths);
      }
      toast.error(error instanceof Error ? error.message : "Failed to submit report");
    }
  }

  return (
    <Card className="border-zinc-200 bg-white/95">
      <CardHeader>
        <CardTitle style={{ fontFamily: "var(--font-heading)" }}>Create Report</CardTitle>
        <CardDescription>Reports expire after 24h unless community verification thresholds are reached.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={form.watch("category")} onValueChange={(value) => form.setValue("category", value as CreateReportInput["category"])}>
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
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="title">Title (optional)</Label>
            <Input id="title" placeholder="Brief summary" {...form.register("title")} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (20-500 chars)</Label>
            <Textarea id="description" placeholder="What happened?" {...form.register("description")} />
            <p className="text-xs text-zinc-600">{form.watch("description")?.length ?? 0}/500</p>
            {isSuspicious ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5" />
                Suspicious activity reports block phone numbers and street addresses.
              </div>
            ) : null}
            {form.formState.errors.description ? <p className="text-xs text-rose-600">{form.formState.errors.description.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label>Location (drag pin to adjust)</Label>
            <LocationPickerMap
              value={currentLocation}
              onChange={(next) => form.setValue("location", next, { shouldDirty: true, shouldValidate: true })}
            />
            <p className="text-xs text-zinc-600">
              Selected: {currentLocation.lat.toFixed(5)}, {currentLocation.lng.toFixed(5)}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="media">Photos (optional, image only)</Label>
            <div className="rounded-lg border border-dashed border-zinc-300 p-3">
              <label htmlFor="media" className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-zinc-700">
                <Camera className="h-4 w-4" />
                Select up to 3 images
              </label>
              <input
                id="media"
                type="file"
                accept="image/*"
                multiple
                className="mt-2 block w-full text-sm"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith("image/")).slice(0, 3);
                  setSelectedFiles(files);
                }}
              />

              {previewUrls.length ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {previewUrls.map((url, index) => (
                    <img key={url} src={url} alt={`upload-preview-${index + 1}`} className="h-20 w-full rounded-md object-cover" />
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <Button type="submit" disabled={createMutation.isPending} className="w-full gap-2">
            {createMutation.isPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
            Submit Report
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
