import { z } from "zod";
import { hasSuspiciousPersonalInfo, getPersonalInfoWarning } from "@/lib/utils/content-safety";
import { INCIDENT_CATEGORIES, INCIDENT_STATUSES, RADIUS_OPTIONS, TIME_WINDOWS } from "@/lib/utils/constants";

export const categorySchema = z.enum(INCIDENT_CATEGORIES);
export const statusSchema = z.enum(INCIDENT_STATUSES);

const latSchema = z.number().min(-90).max(90);
const lngSchema = z.number().min(-180).max(180);

export const locationSchema = z.object({
  lat: latSchema,
  lng: lngSchema
});

export const createReportSchema = z
  .object({
    id: z.string().uuid().optional(),
    category: categorySchema,
    severity: z.coerce.number().int().min(1).max(5),
    title: z.string().trim().max(120).optional().or(z.literal("")),
    description: z.string().trim().min(20).max(500),
    location: locationSchema,
    mediaPaths: z.array(z.string().trim().min(3)).max(3).default([])
  })
  .superRefine((payload, ctx) => {
    if (payload.category === "suspicious_activity" && hasSuspiciousPersonalInfo(payload.description)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: getPersonalInfoWarning(),
        path: ["description"]
      });
    }
  });

export const voteSchema = z.object({
  voteType: z.enum(["confirm", "dispute"])
});

export const reportFiltersSchema = z.object({
  centerLat: latSchema,
  centerLng: lngSchema,
  radiusMiles: z.coerce
    .number()
    .refine((value) => RADIUS_OPTIONS.includes(value as (typeof RADIUS_OPTIONS)[number]), "Unsupported radius"),
  categories: z.array(categorySchema).default([...INCIDENT_CATEGORIES]),
  verifiedOnly: z.coerce.boolean().default(false),
  timeWindow: z
    .string()
    .refine((value) => TIME_WINDOWS.includes(value as (typeof TIME_WINDOWS)[number]), "Invalid time window")
    .default("24h")
});

export const adminReportUpdateSchema = z.object({
  status: z.enum(["verified", "disputed", "resolved", "expired"])
});

export const notificationSettingsSchema = z.object({
  channels: z.array(z.enum(["email", "web_push"])).default(["email"]),
  radius_miles: z.number().min(0.5).max(25).default(3),
  categories: z.array(categorySchema).default([...INCIDENT_CATEGORIES]),
  quiet_hours: z
    .object({
      start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
      end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    })
    .default({ start: "22:00", end: "07:00" }),
  enabled: z.boolean().default(true)
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type ReportFiltersInput = z.infer<typeof reportFiltersSchema>;
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;
