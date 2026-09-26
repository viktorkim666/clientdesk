import { z } from "zod";

export const clientNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Client name is required")
    .max(100, "Keep it under 100 characters"),
});

export type ClientNameInput = z.infer<typeof clientNameSchema>;
