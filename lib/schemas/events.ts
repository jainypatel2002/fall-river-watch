import { z } from "zod";
import { EVENT_CATEGORIES, EVENT_RSVP_STATUSES, EVENT_STATUSES } from "@/lib/types/events";

const latSchema = z.number().min(-90).max(90);
const lngSchema = z.number().min(-180).max(180);

export const eventCategorySchema = z.enum(EVENT_CATEGORIES);
export const eventStatusSchema = z.enum(EVENT_STATUSES);
export const eventRsvpStatusSchema = z.enum(EVENT_RSVP_STATUSES);

const eventBaseSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(80, "Title must be 80 characters or fewer"),
  description: z.string().trim().min(10, "Description must be at least 10 characters"),
  category: eventCategorySchema,
  start_at: z.string().datetime(),
  end_at: z.string().datetime().nullable().optional(),
  location_name: z.string().trim().min(2, "Location is required").max(120, "Location name is too long"),
  address: z.string().trim().max(300, "Address is too long").nullable().optional(),
  street: z.string().trim().max(200, "Street is too long").nullable().optional(),
  city: z.string().trim().min(1, "City is required").max(120, "City is too long"),
  state: z.string().trim().min(1, "State is required").max(120, "State is too long"),
  zip: z.string().trim().max(20, "Zip is too long").nullable().optional(),
  place_id: z.string().trim().max(200, "Place id is too long").nullable().optional(),
  formatted_address: z.string().trim().max(300, "Formatted address is too long").nullable().optional(),
  lat: latSchema,
  lng: lngSchema,
  status: eventStatusSchema.default("scheduled")
});

export const createEventSchema = eventBaseSchema
  .refine((payload) => !payload.end_at || new Date(payload.end_at).getTime() >= new Date(payload.start_at).getTime(), {
    path: ["end_at"],
    message: "End time cannot be before start time"
  })
  .refine((payload) => {
    const hasStreet = Boolean(payload.street?.trim());
    const hasFormattedAddress = Boolean(payload.formatted_address?.trim() || payload.address?.trim());
    return hasStreet || hasFormattedAddress;
  }, {
    path: ["street"],
    message: "Street is required unless a formatted address is available."
  });

export const updateEventSchema = eventBaseSchema
  .partial()
  .refine((value) => Object.values(value).some((item) => typeof item !== "undefined"), "No fields provided")
  .refine((value) => {
    if (!value.end_at || !value.start_at) return true;
    return new Date(value.end_at).getTime() >= new Date(value.start_at).getTime();
  }, {
    path: ["end_at"],
    message: "End time cannot be before start time"
  });

export const listEventsQuerySchema = z.object({
  range: z.enum(["today", "week", "all"]).default("all"),
  category: eventCategorySchema.optional(),
  q: z.string().trim().max(120).optional()
});

export const eventRsvpSchema = z.object({
  status: eventRsvpStatusSchema.nullable()
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
