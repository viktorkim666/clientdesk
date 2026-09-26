import { z } from "zod";

export const workspaceNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Workspace name is required")
    .max(60, "Keep it under 60 characters"),
});

export type WorkspaceNameInput = z.infer<typeof workspaceNameSchema>;
