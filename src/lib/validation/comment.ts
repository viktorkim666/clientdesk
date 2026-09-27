import { z } from "zod";

export const commentSchema = z.object({
  updateId: z.uuid("Choose an update"),
  body: z
    .string()
    .trim()
    .min(1, "Comment body is required")
    .max(2000, "Keep it under 2,000 characters"),
});

export type CommentInput = z.infer<typeof commentSchema>;
