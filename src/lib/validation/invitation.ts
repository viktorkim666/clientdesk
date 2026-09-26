import { z } from "zod";

export const workspaceRoleSchema = z.enum(["owner", "member", "client"]);

export const inviteSchema = z
  .object({
    email: z.email("Enter a valid email address"),
    role: workspaceRoleSchema,
    clientId: z.uuid().optional(),
  })
  .superRefine(({ role, clientId }, ctx) => {
    if (role === "client" && !clientId) {
      ctx.addIssue({
        code: "custom",
        path: ["clientId"],
        message: "Choose a client for a client invitation",
      });
    }
    if (role !== "client" && clientId) {
      ctx.addIssue({
        code: "custom",
        path: ["clientId"],
        message: "Only a client invitation has a client",
      });
    }
  });

export type InviteInput = z.infer<typeof inviteSchema>;
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
