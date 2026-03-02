import { z } from "zod";
import { GROUP_VISIBILITIES } from "@/lib/types/groups";

export const groupVisibilitySchema = z.enum(GROUP_VISIBILITIES);

export const createGroupSchema = z.object({
  name: z.string().trim().min(3, "Group name must be at least 3 characters").max(50, "Group name must be 50 characters or fewer"),
  description: z.string().trim().max(300, "Description must be 300 characters or fewer").optional().or(z.literal("")),
  visibility: groupVisibilitySchema.default("public")
});

export const updateGroupSchema = z.object({
  name: z.string().trim().min(3).max(50).optional(),
  description: z.string().trim().max(300).nullable().optional()
});

export const groupDecisionSchema = z.object({
  decision: z.enum(["accept", "reject"])
});

export const groupVisibilityToggleSchema = z.object({
  visibility: groupVisibilitySchema
});

export const sendGroupChatMessageSchema = z.object({
  anon_name: z.string().trim().min(1, "Anonymous identity is required"),
  message: z.string().trim().min(1, "Message is required").max(1000, "Message is too long")
});

export const createGroupPostSchema = z.object({
  title: z.string().trim().max(120, "Title is too long").nullable().optional(),
  content: z.string().trim().min(1, "Post content is required").max(5000, "Post content is too long")
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
