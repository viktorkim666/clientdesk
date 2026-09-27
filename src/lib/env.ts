import { z } from "zod";

// `.env.local` lines like `RESEND_API_KEY=` load as "", not as a missing
// key, so an optional variable must treat "" the same as absent. Exported so
// `env.server.ts` can build its own schema the same way.
export const optionalString = () =>
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

// Next.js only inlines `process.env.NEXT_PUBLIC_*` into client bundles when
// the property is accessed by name in the source text; passing the whole
// `process.env` object through (as this used to) left those values
// undefined in the browser, because no client bundle referenced any of
// these keys directly. `file-uploader.tsx` is the first client component to
// import `env` (through `lib/supabase/client`), which is what surfaced it.
export const env = parseEnv({
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID:
    process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID,
  SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET:
    process.env.SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
});
