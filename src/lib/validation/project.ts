import { z } from "zod";

export const projectStatusSchema = z.enum(["active", "on_hold", "done"]);

export const projectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Project name is required")
    .max(120, "Keep it under 120 characters"),
  clientId: z.uuid("Choose a client"),
  status: projectStatusSchema,
});

export type ProjectInput = z.infer<typeof projectSchema>;
export type ProjectStatus = z.infer<typeof projectStatusSchema>;
