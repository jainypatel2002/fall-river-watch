import { z } from "zod";
import { INCIDENT_CATEGORIES, TIME_WINDOWS } from "@/lib/utils/constants";

const latSchema = z.number().min(-90).max(90);
const lngSchema = z.number().min(-180).max(180);

export const incidentCategorySchema = z.enum(INCIDENT_CATEGORIES);

export const createIncidentSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(20).max(500),
  category: incidentCategorySchema,
  lat: latSchema,
  lng: lngSchema,
  is_anonymous: z.boolean().default(false),
  danger_radius_meters: z.number().int().min(50).max(5000).nullable().optional(),
  danger_center_lat: latSchema.nullable().optional(),
  danger_center_lng: lngSchema.nullable().optional()
});

export const createIncidentCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000),
  is_anonymous: z.boolean().default(false),
  parent_id: z.string().uuid().nullable().optional(),
  attachmentIds: z.array(z.string().uuid()).max(5).default([])
});

export const reportCommentSchema = z.object({
  reason: z.string().trim().max(500).optional().or(z.literal(""))
});

export const evidenceUploadInitSchema = z
  .object({
    scope: z.enum(["incident", "comment"]),
    incident_id: z.string().uuid().optional(),
    comment_id: z.string().uuid().optional(),
    fileName: z.string().trim().min(1).max(180),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    byteSize: z.number().int().min(1).max(8 * 1024 * 1024)
  })
  .superRefine((value, ctx) => {
    if (value.scope === "incident" && !value.incident_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "incident_id is required for incident scope",
        path: ["incident_id"]
      });
    }

    if (value.scope === "comment" && !value.comment_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "comment_id is required for comment scope",
        path: ["comment_id"]
      });
    }
  });

export const incidentsQuerySchema = z.object({
  bbox: z
    .string()
    .trim()
    .regex(/^[-0-9.]+,[-0-9.]+,[-0-9.]+,[-0-9.]+$/),
  categories: z.array(incidentCategorySchema).optional(),
  limit: z.number().int().min(1).max(500).default(200),
  cursor: z.string().optional(),
  timeRange: z.enum(TIME_WINDOWS).optional()
});
