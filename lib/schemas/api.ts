import { z } from "zod";
import { categorySchema, statusSchema } from "@/lib/schemas/report";

export const reportMediaItemSchema = z.object({
  id: z.string().uuid(),
  storage_path: z.string(),
  media_type: z.literal("image")
});

export const reportRecordSchema = z.object({
  id: z.string().uuid(),
  reporter_id: z.string().uuid(),
  category: categorySchema,
  title: z.string().nullable(),
  description: z.string(),
  severity: z.number().int().min(1).max(5),
  status: statusSchema,
  created_at: z.string(),
  expires_at: z.string(),
  display_lat: z.number(),
  display_lng: z.number(),
  distance_meters: z.number().nullable(),
  confirms: z.number().int().nonnegative(),
  disputes: z.number().int().nonnegative(),
  media: z.array(reportMediaItemSchema)
});

export const reportsQueryResponseSchema = z.object({
  reports: z.array(reportRecordSchema),
  fallbackUsed: z.boolean().optional()
});

export const reportDetailResponseSchema = z.object({
  report: reportRecordSchema.extend({
    user_vote: z.enum(["confirm", "dispute"]).nullable(),
    is_owner: z.boolean(),
    can_resolve: z.boolean()
  })
});
