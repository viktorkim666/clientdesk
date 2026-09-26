import { z } from "zod";

export const signUpSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required"),
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const logInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

export type LogInInput = z.infer<typeof logInSchema>;
