/**
 * Mirrors private.slugify() in supabase/migrations, so the onboarding form
 * can preview the slug create_workspace() will generate (that function
 * appends a random suffix; this preview only matches the readable prefix).
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
