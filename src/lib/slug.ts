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

/**
 * Whether `text` has the alphabet of a slug create_workspace() generates
 * (slugify's output, a hyphen and a hex suffix). A Server Action receives its
 * slug from the caller, and it ends up in revalidatePath() and redirect(), so
 * it is checked first.
 */
export function isWorkspaceSlug(text: string): boolean {
  return /^[a-z0-9-]+$/.test(text);
}
