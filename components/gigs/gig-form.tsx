"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Trash2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { MediaUploader } from "@/components/gigs/media-uploader";
import { LocationAutocomplete, type LocationAutocompleteSelection } from "@/components/location/LocationAutocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSupabaseBrowser } from "@/hooks/use-supabase-browser";
import { useUiToast } from "@/hooks/use-ui-toast";
import { createGigSchema } from "@/lib/schemas/gigs";
import {
  getGigMediaSignedUrl,
  useCreateGigMutation,
  useRemoveGigMediaMutation,
  useUpdateGigMutation
} from "@/lib/queries/gigs";
import { GIG_CATEGORIES, GIG_PAY_TYPES, GIG_SCHEDULE_TYPES, type GigMediaRecord, type GigRecord } from "@/lib/types/gigs";

const FALLBACK_CITY = "Fall River";
const FALLBACK_STATE = "MA";

const formSchema = z
  .object({
    title: z.string().trim().min(3, "Title must be at least 3 characters").max(120, "Title is too long"),
    category: z.enum(GIG_CATEGORIES),
    description: z.string().trim().min(10, "Description must be at least 10 characters").max(5000, "Description is too long"),
    pay_type: z.enum(GIG_PAY_TYPES),
    pay_amount: z.string().trim().optional(),
    currency: z.string().trim().min(1, "Currency is required").max(10, "Currency is too long"),
    is_remote: z.boolean().default(false),
    location_query: z.string().trim().max(300, "Location query is too long"),
    location_name: z.string().trim().min(2, "Location name is required").max(120, "Location name is too long"),
    street: z.string().trim().max(200, "Street is too long").optional(),
    city: z.string().trim().min(1, "City is required").max(120, "City is too long"),
    state: z.string().trim().min(1, "State is required").max(120, "State is too long"),
    zip: z.string().trim().max(20, "ZIP is too long").optional(),
    lat: z.string().trim().optional(),
    lng: z.string().trim().optional(),
    schedule_type: z.enum(GIG_SCHEDULE_TYPES),
    start_local: z.string().optional(),
    duration_minutes: z.string().trim().optional(),
    people_needed: z.string().trim().min(1, "People needed is required"),
    tools_required: z.boolean().default(false),
    tools_list: z.string().trim().max(600, "Tools list is too long").optional()
  })
  .superRefine((value, context) => {
    if (value.pay_type !== "free") {
      const amount = Number(value.pay_amount);
      if (!value.pay_amount || !Number.isFinite(amount) || amount <= 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["pay_amount"],
          message: "Pay amount is required for fixed/hourly gigs"
        });
      }
    }

    if (value.pay_type === "free" && value.pay_amount?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pay_amount"],
        message: "Pay amount must be empty for free gigs"
      });
    }

    if (value.schedule_type === "scheduled" && !value.start_local) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["start_local"],
        message: "Start time is required for scheduled gigs"
      });
    }

    if (value.tools_required && !value.tools_list?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tools_list"],
        message: "List required tools"
      });
    }

    if (value.lat?.trim()) {
      const lat = Number(value.lat);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lat"],
          message: "Latitude must be between -90 and 90"
        });
      }
    }

    if (value.lng?.trim()) {
      const lng = Number(value.lng);
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["lng"],
          message: "Longitude must be between -180 and 180"
        });
      }
    }

    const people = Number(value.people_needed);
    if (!Number.isFinite(people) || people < 1 || people > 100) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["people_needed"],
        message: "People needed must be between 1 and 100"
      });
    }

    if (value.duration_minutes?.trim()) {
      const duration = Number(value.duration_minutes);
      if (!Number.isFinite(duration) || duration <= 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["duration_minutes"],
          message: "Duration must be greater than 0"
        });
      }
    }
  });

type GigFormValues = z.input<typeof formSchema>;

function isoToLocalInput(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function localInputToIso(value: string) {
  return new Date(value).toISOString();
}

function sanitizeFileExt(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "jpg";
  return ext.replace(/[^a-z0-9]/g, "").slice(0, 12) || "jpg";
}

export function GigForm({
  mode,
  gigId,
  initialGig,
  initialMedia
}: {
  mode: "create" | "edit";
  gigId?: string;
  initialGig?: GigRecord;
  initialMedia?: GigMediaRecord[];
}) {
  const router = useRouter();
  const supabase = useSupabaseBrowser();
  const toast = useUiToast();
  const createGigMutation = useCreateGigMutation();
  const updateGigMutation = useUpdateGigMutation(gigId ?? "");
  const removeGigMediaMutation = useRemoveGigMediaMutation(gigId ?? "");

  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mediaItems, setMediaItems] = useState<GigMediaRecord[]>(initialMedia ?? []);
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  const [manualLocationEdit, setManualLocationEdit] = useState(false);

  useEffect(() => {
    setMediaItems(initialMedia ?? []);
  }, [initialMedia]);

  useEffect(() => {
    let active = true;

    async function hydrateMediaUrls() {
      const entries = await Promise.all(
        mediaItems.map(async (item) => {
          try {
            const url = await getGigMediaSignedUrl(item.storage_path);
            return [item.id, url] as const;
          } catch {
            return [item.id, ""] as const;
          }
        })
      );

      if (!active) return;
      setMediaUrls(Object.fromEntries(entries.filter((entry) => entry[1])));
    }

    if (mediaItems.length) {
      void hydrateMediaUrls();
    } else {
      setMediaUrls({});
    }

    return () => {
      active = false;
    };
  }, [mediaItems]);

  const defaultValues = useMemo<GigFormValues>(
    () => ({
      location_query:
        [initialGig?.street, initialGig?.city, initialGig?.state, initialGig?.zip].filter((value) => Boolean(value?.trim())).join(", ") ||
        initialGig?.location_name ||
        "",
      title: initialGig?.title ?? "",
      category: initialGig?.category ?? "other",
      description: initialGig?.description ?? "",
      pay_type: initialGig?.pay_type ?? "fixed",
      pay_amount: initialGig?.pay_amount !== null && typeof initialGig?.pay_amount !== "undefined" ? String(initialGig.pay_amount) : "",
      currency: initialGig?.currency ?? "USD",
      is_remote: initialGig?.is_remote ?? false,
      location_name: initialGig?.location_name ?? "",
      street: initialGig?.street ?? "",
      city: initialGig?.city ?? FALLBACK_CITY,
      state: initialGig?.state ?? FALLBACK_STATE,
      zip: initialGig?.zip ?? "",
      lat: initialGig?.lat !== null && typeof initialGig?.lat !== "undefined" ? String(initialGig.lat) : "",
      lng: initialGig?.lng !== null && typeof initialGig?.lng !== "undefined" ? String(initialGig.lng) : "",
      schedule_type: initialGig?.schedule_type ?? "asap",
      start_local: initialGig?.start_at ? isoToLocalInput(initialGig.start_at) : "",
      duration_minutes:
        initialGig?.duration_minutes !== null && typeof initialGig?.duration_minutes !== "undefined"
          ? String(initialGig.duration_minutes)
          : "",
      people_needed: String(initialGig?.people_needed ?? 1),
      tools_required: initialGig?.tools_required ?? false,
      tools_list: initialGig?.tools_list ?? ""
    }),
    [initialGig]
  );

  const form = useForm<GigFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues
  });

  useEffect(() => {
    form.reset(defaultValues);
    setManualLocationEdit(false);
  }, [defaultValues, form]);

  const selectedPayType = useWatch({ control: form.control, name: "pay_type" });
  const selectedSchedule = useWatch({ control: form.control, name: "schedule_type" });
  const toolsRequired = useWatch({ control: form.control, name: "tools_required" });
  const locationQuery = useWatch({ control: form.control, name: "location_query" });

  const targetGigId = mode === "edit" ? gigId ?? initialGig?.id ?? "" : "";

  function handleLocationQueryChange(text: string) {
    form.setValue("location_query", text, { shouldDirty: true, shouldValidate: true });
    form.setValue("location_name", text.trim(), { shouldDirty: true, shouldValidate: true });
    form.setValue("lat", "", { shouldDirty: true, shouldValidate: true });
    form.setValue("lng", "", { shouldDirty: true, shouldValidate: true });
  }

  function handleLocationSelect(location: LocationAutocompleteSelection) {
    const fullAddress = location.full_address?.trim() || location.location_name;
    const normalizedLocationName = location.location_name.trim() || fullAddress;

    form.setValue("location_query", fullAddress, { shouldDirty: true, shouldValidate: true });
    form.setValue("location_name", normalizedLocationName, { shouldDirty: true, shouldValidate: true });
    form.setValue("street", location.street.trim(), { shouldDirty: true, shouldValidate: true });
    form.setValue("city", (location.city.trim() || FALLBACK_CITY).slice(0, 120), { shouldDirty: true, shouldValidate: true });
    form.setValue("state", (location.state.trim() || FALLBACK_STATE).slice(0, 120), { shouldDirty: true, shouldValidate: true });
    form.setValue("zip", location.zip.trim(), { shouldDirty: true, shouldValidate: true });
    form.setValue("lat", String(location.lat), { shouldDirty: true, shouldValidate: true });
    form.setValue("lng", String(location.lng), { shouldDirty: true, shouldValidate: true });
    form.clearErrors(["location_name", "city", "state", "lat", "lng"]);
  }

  async function handleSubmit(values: GigFormValues) {
    setIsSubmitting(true);

    try {
      const typedLocation = values.location_query?.trim() ?? "";
      const normalizedLocationName = values.location_name.trim() || typedLocation;
      const normalizedCity = values.city.trim() || FALLBACK_CITY;
      const normalizedState = values.state.trim() || FALLBACK_STATE;

      const payload = createGigSchema.parse({
        title: values.title,
        category: values.category,
        description: values.description,
        pay_type: values.pay_type,
        pay_amount: values.pay_type === "free" ? null : Number(values.pay_amount),
        currency: values.currency.toUpperCase(),
        is_remote: values.is_remote,
        location_name: normalizedLocationName,
        street: values.street?.trim() ? values.street.trim() : null,
        city: normalizedCity,
        state: normalizedState,
        zip: values.zip?.trim() ? values.zip.trim() : null,
        lat: values.lat?.trim() ? Number(values.lat) : null,
        lng: values.lng?.trim() ? Number(values.lng) : null,
        schedule_type: values.schedule_type,
        start_at: values.start_local ? localInputToIso(values.start_local) : null,
        duration_minutes: values.duration_minutes?.trim() ? Number(values.duration_minutes) : null,
        people_needed: Number(values.people_needed),
        tools_required: values.tools_required,
        tools_list: values.tools_list?.trim() ? values.tools_list.trim() : null
      });

      const gig = mode === "create" ? await createGigMutation.mutateAsync(payload) : await updateGigMutation.mutateAsync(payload);
      const resultingGigId = gig.id;

      if (newFiles.length) {
        const {
          data: { user }
        } = await supabase.auth.getUser();

        if (!user) {
          throw new Error("Authentication expired. Please sign in again.");
        }

        const uploadedPaths: string[] = [];
        const mediaRows: Array<{ storage_path: string; mime_type: string }> = [];

        try {
          for (const file of newFiles) {
            const ext = sanitizeFileExt(file.name);
            const path = `gigs/${resultingGigId}/${crypto.randomUUID()}.${ext}`;

            const { error: uploadError } = await supabase.storage.from("gig-media").upload(path, file, {
              cacheControl: "3600",
              upsert: false,
              contentType: file.type
            });

            if (uploadError) throw new Error(uploadError.message);

            uploadedPaths.push(path);
            mediaRows.push({
              storage_path: path,
              mime_type: file.type || "image/jpeg"
            });
          }

          const { error: mediaInsertError } = await supabase.from("gig_media").insert(
            mediaRows.map((row) => ({
              gig_id: resultingGigId,
              uploader_user_id: user.id,
              storage_path: row.storage_path,
              public_url: row.storage_path,
              mime_type: row.mime_type
            }))
          );

          if (mediaInsertError) {
            await supabase.storage.from("gig-media").remove(uploadedPaths);
            throw new Error(mediaInsertError.message);
          }
        } catch (uploadError) {
          throw new Error(uploadError instanceof Error ? uploadError.message : "Failed to upload media");
        }
      }

      toast.success(mode === "create" ? "Gig posted" : "Gig updated");
      router.push(`/gigs/${resultingGigId}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save gig");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRemoveExistingMedia(media: GigMediaRecord) {
    if (!targetGigId) return;
    setDeletingMediaId(media.id);

    try {
      const deleted = await removeGigMediaMutation.mutateAsync(media.id);
      if (deleted) {
        const { error: storageError } = await supabase.storage.from("gig-media").remove([deleted.storage_path]);
        if (storageError) {
          toast.info("Media removed from gig", "Storage cleanup may finish shortly.");
        }
      }

      setMediaItems((current) => current.filter((item) => item.id !== media.id));
      setMediaUrls((current) => {
        const next = { ...current };
        delete next[media.id];
        return next;
      });
      toast.success("Media removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove media");
    } finally {
      setDeletingMediaId(null);
    }
  }

  const busy = isSubmitting || createGigMutation.isPending || updateGigMutation.isPending;

  return (
    <form className="space-y-5" onSubmit={form.handleSubmit((values) => void handleSubmit(values))}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="gig-title">Title</Label>
          <Input id="gig-title" {...form.register("title")} />
          {form.formState.errors.title ? <p className="text-xs text-rose-300">{form.formState.errors.title.message}</p> : null}
        </div>

        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={form.watch("category")} onValueChange={(value) => form.setValue("category", value as GigFormValues["category"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GIG_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {category.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Pay Type</Label>
          <Select value={selectedPayType} onValueChange={(value) => form.setValue("pay_type", value as GigFormValues["pay_type"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GIG_PAY_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedPayType !== "free" ? (
          <div className="space-y-2">
            <Label htmlFor="gig-pay-amount">Pay Amount</Label>
            <Input id="gig-pay-amount" type="number" min={0} step="0.01" {...form.register("pay_amount")} />
            {form.formState.errors.pay_amount ? <p className="text-xs text-rose-300">{form.formState.errors.pay_amount.message}</p> : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="gig-currency">Currency</Label>
          <Input id="gig-currency" placeholder="USD" {...form.register("currency")} />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="gig-description">Description</Label>
          <Textarea id="gig-description" rows={5} {...form.register("description")} />
          {form.formState.errors.description ? <p className="text-xs text-rose-300">{form.formState.errors.description.message}</p> : null}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.65)] px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-[var(--fg)]">Remote friendly</p>
              <p className="text-xs text-[color:var(--muted)]">Toggle if this gig can be done remotely.</p>
            </div>
            <Switch checked={Boolean(form.watch("is_remote"))} onCheckedChange={(next) => form.setValue("is_remote", next)} />
          </div>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="gig-location-query">Location</Label>
          <LocationAutocomplete
            inputId="gig-location-query"
            value={locationQuery ?? ""}
            onChangeText={handleLocationQueryChange}
            onSelect={handleLocationSelect}
            placeholder="Type address or place"
            disabled={busy}
            error={form.formState.errors.location_query?.message}
          />
          <input type="hidden" {...form.register("location_query")} />
          <input type="hidden" {...form.register("location_name")} />
          <input type="hidden" {...form.register("lat")} />
          <input type="hidden" {...form.register("lng")} />
          {form.formState.errors.location_name ? <p className="text-xs text-rose-300">{form.formState.errors.location_name.message}</p> : null}
          {form.formState.errors.lat ? <p className="text-xs text-rose-300">{form.formState.errors.lat.message}</p> : null}
          {form.formState.errors.lng ? <p className="text-xs text-rose-300">{form.formState.errors.lng.message}</p> : null}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.65)] px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-[var(--fg)]">Edit location fields manually</p>
              <p className="text-xs text-[color:var(--muted)]">Turn on to override street/city/state/zip after selecting a suggestion.</p>
            </div>
            <Switch checked={manualLocationEdit} onCheckedChange={setManualLocationEdit} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gig-street">Street (optional)</Label>
          <Input
            id="gig-street"
            readOnly={!manualLocationEdit}
            className={!manualLocationEdit ? "bg-[rgba(10,15,28,0.45)]" : undefined}
            {...form.register("street")}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="gig-city">City</Label>
          <Input
            id="gig-city"
            readOnly={!manualLocationEdit}
            className={!manualLocationEdit ? "bg-[rgba(10,15,28,0.45)]" : undefined}
            {...form.register("city")}
          />
          {form.formState.errors.city ? <p className="text-xs text-rose-300">{form.formState.errors.city.message}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="gig-state">State</Label>
          <Input
            id="gig-state"
            readOnly={!manualLocationEdit}
            className={!manualLocationEdit ? "bg-[rgba(10,15,28,0.45)]" : undefined}
            {...form.register("state")}
          />
          {form.formState.errors.state ? <p className="text-xs text-rose-300">{form.formState.errors.state.message}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="gig-zip">ZIP (optional)</Label>
          <Input
            id="gig-zip"
            readOnly={!manualLocationEdit}
            className={!manualLocationEdit ? "bg-[rgba(10,15,28,0.45)]" : undefined}
            {...form.register("zip")}
          />
        </div>

        <div className="space-y-2">
          <Label>Schedule</Label>
          <Select value={selectedSchedule} onValueChange={(value) => form.setValue("schedule_type", value as GigFormValues["schedule_type"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GIG_SCHEDULE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedSchedule === "scheduled" ? (
          <div className="space-y-2">
            <Label htmlFor="gig-start">Start</Label>
            <Input id="gig-start" type="datetime-local" {...form.register("start_local")} />
            {form.formState.errors.start_local ? <p className="text-xs text-rose-300">{form.formState.errors.start_local.message}</p> : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="gig-duration">Duration (minutes, optional)</Label>
          <Input id="gig-duration" type="number" min={1} step={1} {...form.register("duration_minutes")} />
          {form.formState.errors.duration_minutes ? (
            <p className="text-xs text-rose-300">{form.formState.errors.duration_minutes.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="gig-people">People Needed</Label>
          <Input id="gig-people" type="number" min={1} max={100} step={1} {...form.register("people_needed")} />
          {form.formState.errors.people_needed ? <p className="text-xs text-rose-300">{form.formState.errors.people_needed.message}</p> : null}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.65)] px-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-[var(--fg)]">Tools required</p>
              <p className="text-xs text-[color:var(--muted)]">Set this when workers need to bring specific tools.</p>
            </div>
            <Switch checked={Boolean(toolsRequired)} onCheckedChange={(next) => form.setValue("tools_required", next)} />
          </div>
        </div>

        {toolsRequired ? (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="gig-tools-list">Required Tools</Label>
            <Textarea id="gig-tools-list" rows={3} placeholder="Ladder, rake, work gloves" {...form.register("tools_list")} />
            {form.formState.errors.tools_list ? <p className="text-xs text-rose-300">{form.formState.errors.tools_list.message}</p> : null}
          </div>
        ) : null}
      </div>

      {mode === "edit" && mediaItems.length ? (
        <section className="space-y-2">
          <Label>Existing Media</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {mediaItems.map((media) => (
              <div key={media.id} className="relative">
                {mediaUrls[media.id] ? (
                  <img
                    src={mediaUrls[media.id]}
                    alt={`gig-media-${media.id}`}
                    className="h-24 w-full rounded-xl border border-[var(--border)] object-cover"
                  />
                ) : (
                  <div className="h-24 w-full rounded-xl border border-[var(--border)] bg-[rgba(10,15,28,0.6)]" />
                )}
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute right-1 top-1 h-7 w-7"
                  disabled={deletingMediaId === media.id || busy}
                  onClick={() => void handleRemoveExistingMedia(media)}
                >
                  {deletingMediaId === media.id ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  <span className="sr-only">Remove media</span>
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <MediaUploader files={newFiles} onChange={setNewFiles} maxFiles={5} disabled={busy} />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button type="button" variant="ghost" disabled={busy} onClick={() => router.back()}>
          Cancel
        </Button>
        <Button type="submit" className="gap-2" disabled={busy}>
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
          {mode === "create" ? "Post Gig" : "Save Gig"}
        </Button>
      </div>
    </form>
  );
}
