"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { EventLocationAutocomplete } from "@/components/events/event-location-autocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUiToast } from "@/hooks/use-ui-toast";
import { useCreateEventMutation, useUpdateEventMutation } from "@/lib/queries/events";
import type { PlaceSuggestion } from "@/lib/mapbox";
import { createEventSchema } from "@/lib/schemas/events";
import { EVENT_CATEGORIES, EVENT_STATUSES, type EventCategory, type EventStatus, type EventWithMeta } from "@/lib/types/events";
import { z } from "zod";

const formSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(80, "Title must be 80 characters or fewer"),
  description: z.string().trim().min(10, "Description must be at least 10 characters"),
  category: z.enum(EVENT_CATEGORIES),
  status: z.enum(EVENT_STATUSES),
  start_local: z.string().min(1, "Start time is required"),
  end_local: z.string().optional(),
  location_search: z.string().trim().min(2, "Location search is required"),
  location_name: z.string().trim().max(120, "Location name is too long"),
  address: z.string().trim().max(300, "Address is too long"),
  formatted_address: z.string().trim().max(300, "Address is too long"),
  street: z.string().trim().max(200, "Street is too long"),
  city: z.string().trim().max(120, "City is too long"),
  state: z.string().trim().max(120, "State is too long"),
  zip: z.string().trim().max(20, "Zip is too long"),
  place_id: z.string().trim().max(200, "Place id is too long"),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable()
});

type EventFormValues = z.input<typeof formSchema>;

function isoToLocalInput(iso: string) {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function localInputToIso(value: string) {
  return new Date(value).toISOString();
}

export function EventForm({
  mode,
  eventId,
  initialEvent
}: {
  mode: "create" | "edit";
  eventId?: string;
  initialEvent?: EventWithMeta;
}) {
  const router = useRouter();
  const toast = useUiToast();
  const createMutation = useCreateEventMutation();
  const updateMutation = useUpdateEventMutation(eventId ?? "");

  const defaultValues = useMemo<EventFormValues>(() => {
    const now = new Date();
    const oneHour = new Date(now.getTime() + 60 * 60 * 1000);
    const locationSearch =
      initialEvent?.formatted_address ??
      initialEvent?.address ??
      [initialEvent?.street, initialEvent?.city, initialEvent?.state, initialEvent?.zip].filter(Boolean).join(", ");

    return {
      title: initialEvent?.title ?? "",
      description: initialEvent?.description ?? "",
      category: initialEvent?.category ?? "community",
      start_local: initialEvent?.start_at ? isoToLocalInput(initialEvent.start_at) : isoToLocalInput(oneHour.toISOString()),
      end_local: initialEvent?.end_at ? isoToLocalInput(initialEvent.end_at) : "",
      location_search: locationSearch ?? "",
      location_name: initialEvent?.location_name ?? "",
      address: initialEvent?.address ?? initialEvent?.formatted_address ?? "",
      formatted_address: initialEvent?.formatted_address ?? initialEvent?.address ?? "",
      street: initialEvent?.street ?? "",
      city: initialEvent?.city ?? "",
      state: initialEvent?.state ?? "",
      zip: initialEvent?.zip ?? "",
      place_id: initialEvent?.place_id ?? "",
      lat: initialEvent?.lat ?? null,
      lng: initialEvent?.lng ?? null,
      status: initialEvent?.status ?? "scheduled"
    };
  }, [initialEvent]);

  const [locationResolved, setLocationResolved] = useState<boolean>(() =>
    Boolean(defaultValues.lat !== null && defaultValues.lng !== null && defaultValues.city && defaultValues.state)
  );

  const form = useForm<EventFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues
  });
  const selectedCategory = useWatch({ control: form.control, name: "category" });
  const selectedStatus = useWatch({ control: form.control, name: "status" });
  const locationSearchValue = useWatch({ control: form.control, name: "location_search" });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function onSelectLocationSuggestion(location: PlaceSuggestion) {
    const nextLocationName = location.location_name || location.title;
    const nextFormatted = location.formatted_address;

    form.setValue("location_search", nextFormatted, { shouldDirty: true, shouldValidate: true });
    form.setValue("formatted_address", nextFormatted, { shouldDirty: true, shouldValidate: true });
    form.setValue("address", nextFormatted, { shouldDirty: true });
    form.setValue("place_id", location.place_id ?? "", { shouldDirty: true });
    form.setValue("street", location.street ?? "", { shouldDirty: true, shouldValidate: true });
    form.setValue("city", location.city ?? "", { shouldDirty: true, shouldValidate: true });
    form.setValue("state", location.state ?? "", { shouldDirty: true, shouldValidate: true });
    form.setValue("zip", location.zip ?? "", { shouldDirty: true });
    form.setValue("lat", location.lat, { shouldDirty: true, shouldValidate: true });
    form.setValue("lng", location.lng, { shouldDirty: true, shouldValidate: true });
    form.setValue("location_name", nextLocationName, { shouldDirty: true, shouldValidate: true });
    form.clearErrors("location_search");
    form.clearErrors("lat");
    form.clearErrors("lng");
    setLocationResolved(true);
  }

  function invalidateLocationSelection() {
    setLocationResolved(false);
    form.setValue("lat", null, { shouldDirty: true });
    form.setValue("lng", null, { shouldDirty: true });
    form.setValue("place_id", "", { shouldDirty: true });
    form.setValue("formatted_address", "", { shouldDirty: true });
    form.setValue("address", "", { shouldDirty: true });
    form.setValue("street", "", { shouldDirty: true });
    form.setValue("city", "", { shouldDirty: true });
    form.setValue("state", "", { shouldDirty: true });
    form.setValue("zip", "", { shouldDirty: true });
  }

  async function onSubmit(values: EventFormValues) {
    const startAt = localInputToIso(values.start_local);
    const endAt = values.end_local ? localInputToIso(values.end_local) : null;
    if (!locationResolved || values.lat === null || values.lng === null) {
      form.setError("location_search", {
        type: "manual",
        message: "Select a location from suggestions."
      });
      return;
    }

    const city = values.city.trim();
    const state = values.state.trim();
    let hasLocationFieldError = false;

    if (!city) {
      form.setError("city", {
        type: "manual",
        message: "City is required."
      });
      hasLocationFieldError = true;
    }

    if (!state) {
      form.setError("state", {
        type: "manual",
        message: "State is required."
      });
      hasLocationFieldError = true;
    }

    if (hasLocationFieldError) return;

    const formattedAddress = values.formatted_address.trim() || values.location_search.trim();
    const fallbackLocationName = values.location_name.trim() || values.street.trim() || formattedAddress;

    const payload = createEventSchema.parse({
      title: values.title,
      description: values.description,
      category: values.category as EventCategory,
      start_at: startAt,
      end_at: endAt,
      location_name: fallbackLocationName,
      address: formattedAddress || null,
      street: values.street.trim() || null,
      city,
      state,
      zip: values.zip.trim() || null,
      place_id: values.place_id.trim() || null,
      formatted_address: formattedAddress || null,
      lat: values.lat,
      lng: values.lng,
      status: values.status as EventStatus
    });

    if (!window.confirm(mode === "create" ? "Create this event?" : "Save changes to this event?")) {
      return;
    }

    try {
      if (mode === "create") {
        const result = await createMutation.mutateAsync(payload);
        toast.success("Event created");
        router.push(`/events/${result.event.id}`);
        router.refresh();
        return;
      }

      if (!eventId) {
        toast.error("Event id missing");
        return;
      }

      const result = await updateMutation.mutateAsync(payload);
      toast.success("Event updated");
      router.push(`/events/${result.event.id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save event");
    }
  }

  return (
    <form className="space-y-5" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" {...form.register("title")} />
          {form.formState.errors.title ? <p className="text-xs text-rose-300">{form.formState.errors.title.message}</p> : null}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea id="description" {...form.register("description")} rows={5} />
          {form.formState.errors.description ? <p className="text-xs text-rose-300">{form.formState.errors.description.message}</p> : null}
        </div>

        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={selectedCategory} onValueChange={(value) => form.setValue("category", value as EventCategory)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENT_CATEGORIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={selectedStatus} onValueChange={(value) => form.setValue("status", value as EventStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EVENT_STATUSES.map((item) => (
                <SelectItem key={item} value={item}>
                  {item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="start_local">Start time</Label>
          <Input id="start_local" type="datetime-local" {...form.register("start_local")} />
          {form.formState.errors.start_local ? <p className="text-xs text-rose-300">{form.formState.errors.start_local.message}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="end_local">End time (optional)</Label>
          <Input id="end_local" type="datetime-local" {...form.register("end_local")} />
          {form.formState.errors.end_local ? <p className="text-xs text-rose-300">{form.formState.errors.end_local.message}</p> : null}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="location_search">Location search</Label>
          <EventLocationAutocomplete
            inputId="location_search"
            value={locationSearchValue ?? ""}
            onValueChange={(value) => form.setValue("location_search", value, { shouldDirty: true, shouldValidate: true })}
            onSelectLocation={onSelectLocationSuggestion}
            onInvalidateLocation={invalidateLocationSelection}
            disabled={isSaving}
            error={form.formState.errors.location_search?.message}
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="location_name">Location name (optional)</Label>
          <Input id="location_name" {...form.register("location_name")} />
          {form.formState.errors.location_name ? <p className="text-xs text-rose-300">{form.formState.errors.location_name.message}</p> : null}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="street">Street</Label>
          <Input id="street" {...form.register("street")} />
          {form.formState.errors.street ? <p className="text-xs text-rose-300">{form.formState.errors.street.message}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input id="city" {...form.register("city")} />
          {form.formState.errors.city ? <p className="text-xs text-rose-300">{form.formState.errors.city.message}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="state">State</Label>
          <Input id="state" {...form.register("state")} />
          {form.formState.errors.state ? <p className="text-xs text-rose-300">{form.formState.errors.state.message}</p> : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="zip">Zip</Label>
          <Input id="zip" {...form.register("zip")} />
          {form.formState.errors.zip ? <p className="text-xs text-rose-300">{form.formState.errors.zip.message}</p> : null}
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : mode === "create" ? "Create event" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
