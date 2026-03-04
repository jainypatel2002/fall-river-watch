import { z } from "zod";
import {
  GIG_APPLICATION_STATUSES,
  GIG_CATEGORIES,
  GIG_FLAG_REASONS,
  GIG_PAY_TYPES,
  GIG_SCHEDULE_TYPES,
  GIG_STATUSES
} from "@/lib/types/gigs";

const latSchema = z.number().min(-90).max(90);
const lngSchema = z.number().min(-180).max(180);

export const gigCategorySchema = z.enum(GIG_CATEGORIES);
export const gigPayTypeSchema = z.enum(GIG_PAY_TYPES);
export const gigScheduleTypeSchema = z.enum(GIG_SCHEDULE_TYPES);
export const gigStatusSchema = z.enum(GIG_STATUSES);
export const gigApplicationStatusSchema = z.enum(GIG_APPLICATION_STATUSES);
export const gigFlagReasonSchema = z.enum(GIG_FLAG_REASONS);

const gigBaseSchema = z.object({
  title: z.string().trim().min(3, "Title must be at least 3 characters").max(120, "Title is too long"),
  category: gigCategorySchema,
  description: z.string().trim().min(10, "Description must be at least 10 characters").max(5000, "Description is too long"),
  pay_type: gigPayTypeSchema,
  pay_amount: z.number().positive("Pay amount must be greater than 0").nullable().optional(),
  currency: z.string().trim().min(1, "Currency is required").max(10, "Currency is too long").default("USD"),
  is_remote: z.boolean().default(false),
  location_name: z.string().trim().min(2, "Location name is required").max(120, "Location name is too long"),
  street: z.string().trim().max(200, "Street is too long").nullable().optional(),
  city: z.string().trim().min(1, "City is required").max(120, "City is too long").default("Fall River"),
  state: z.string().trim().min(1, "State is required").max(120, "State is too long").default("MA"),
  zip: z.string().trim().max(20, "ZIP code is too long").nullable().optional(),
  lat: latSchema.nullable().optional(),
  lng: lngSchema.nullable().optional(),
  schedule_type: gigScheduleTypeSchema,
  start_at: z.string().datetime().nullable().optional(),
  duration_minutes: z.number().int().positive("Duration must be greater than 0").nullable().optional(),
  people_needed: z.number().int().min(1, "People needed must be at least 1").max(100, "People needed is too high").default(1),
  tools_required: z.boolean().default(false),
  tools_list: z.string().trim().max(600, "Tools list is too long").nullable().optional()
});

export const createGigSchema = gigBaseSchema.superRefine((payload, context) => {
  if (payload.pay_type !== "free" && (typeof payload.pay_amount === "undefined" || payload.pay_amount === null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pay_amount"],
      message: "Pay amount is required for fixed/hourly gigs"
    });
  }

  if (payload.pay_type === "free" && payload.pay_amount !== null && typeof payload.pay_amount !== "undefined") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["pay_amount"],
      message: "Pay amount must be empty for free gigs"
    });
  }

  if (payload.schedule_type === "scheduled" && !payload.start_at) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["start_at"],
      message: "Start time is required for scheduled gigs"
    });
  }

  if (payload.tools_required && !payload.tools_list?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["tools_list"],
      message: "List required tools"
    });
  }
});

export const updateGigSchema = gigBaseSchema
  .partial()
  .refine((payload) => Object.values(payload).some((item) => typeof item !== "undefined"), "No fields provided")
  .superRefine((payload, context) => {
    if (
      payload.pay_type &&
      payload.pay_type !== "free" &&
      Object.prototype.hasOwnProperty.call(payload, "pay_amount") &&
      (typeof payload.pay_amount === "undefined" || payload.pay_amount === null)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pay_amount"],
        message: "Pay amount is required for fixed/hourly gigs"
      });
    }

    if (payload.pay_type === "free" && payload.pay_amount !== null && typeof payload.pay_amount !== "undefined") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pay_amount"],
        message: "Pay amount must be empty for free gigs"
      });
    }

    if (payload.schedule_type === "scheduled" && Object.prototype.hasOwnProperty.call(payload, "start_at") && !payload.start_at) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["start_at"],
        message: "Start time is required for scheduled gigs"
      });
    }

    if (payload.tools_required && Object.prototype.hasOwnProperty.call(payload, "tools_list") && !payload.tools_list?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tools_list"],
        message: "List required tools"
      });
    }
  });

export const listGigsSchema = z.object({
  category: z.union([z.literal("all"), gigCategorySchema]).default("all"),
  payType: z.union([z.literal("all"), gigPayTypeSchema]).default("all"),
  status: z.union([z.literal("all"), gigStatusSchema]).default("open"),
  q: z.string().trim().max(120).default("")
});

export const applyToGigSchema = z.object({
  message: z.string().trim().min(1, "Message is required").max(1000, "Message is too long"),
  offered_pay_amount: z.number().positive("Offered pay must be greater than 0").nullable().optional(),
  availability: z.string().trim().max(240, "Availability is too long").nullable().optional(),
  has_tools: z.boolean().default(false)
});

export const respondToGigApplicationSchema = z.object({
  decision: z.enum(["accept", "decline"])
});

export const updateGigStatusSchema = z.object({
  status: z.enum(["open", "assigned", "in_progress", "completed", "canceled"])
});

export const sendGigMessageSchema = z.object({
  message: z.string().trim().min(1, "Message is required").max(1000, "Message is too long")
});

export const createGigReviewSchema = z.object({
  rating: z.union([z.literal(-1), z.literal(1)]),
  comment: z.string().trim().max(200, "Comment is too long").optional().or(z.literal(""))
});

export const createGigFlagSchema = z.object({
  reason: gigFlagReasonSchema,
  details: z.string().trim().max(400, "Details are too long").optional().or(z.literal(""))
});

export const gigMediaUrlRequestSchema = z.object({
  path: z.string().trim().min(1, "Storage path is required").max(500, "Storage path is too long")
});

export type CreateGigInput = z.infer<typeof createGigSchema>;
export type UpdateGigInput = z.infer<typeof updateGigSchema>;
export type ApplyToGigInput = z.infer<typeof applyToGigSchema>;
export type RespondToGigApplicationInput = z.infer<typeof respondToGigApplicationSchema>;
export type UpdateGigStatusInput = z.infer<typeof updateGigStatusSchema>;
export type SendGigMessageInput = z.infer<typeof sendGigMessageSchema>;
export type CreateGigReviewInput = z.infer<typeof createGigReviewSchema>;
export type CreateGigFlagInput = z.infer<typeof createGigFlagSchema>;
