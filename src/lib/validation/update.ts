import { z } from "zod";

export const updateSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Update body is required")
    .max(5000, "Keep it under 5,000 characters"),
});

export type UpdateInput = z.infer<typeof updateSchema>;
