import { z } from "zod";

// `.env.local` lines like `RESEND_API_KEY=` load as "", not as a missing
// key, so an optional variable must treat "" the same as absent.
const optionalString = () =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  );

const envSchema = z.object({
  // The app's own canonical base URL (e.g. https://clientdesk.example.com,
  // http://localhost:3000 locally). Used to build absolute links — invite
  // emails, OAuth redirects — instead of trusting request headers, which a
  // client can spoof (Host header poisoning).
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID: optionalString(),
  SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET: optionalString(),
  RESEND_API_KEY: optionalString(),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates the variables a running app needs against the schema above.
 * Throws with every missing or invalid variable named, instead of failing
 * later with a confusing runtime error.
 */
export function parseEnv(raw: unknown): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment variables: ${issues}`);
  }

  return result.data;
}

export const env = parseEnv(process.env);
