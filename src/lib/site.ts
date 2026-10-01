export const SITE_DESCRIPTION =
  "Clientdesk is a client portal where small agencies and freelancers share project status, files and updates with their clients.";

/**
 * Base URL for metadata. A Vercel preview deployment uses its own branch URL
 * (which has no protocol); everything else uses the configured site URL.
 */
export function resolveMetadataBase(input: {
  siteUrl: string;
  vercelEnv?: string;
  vercelBranchUrl?: string;
}): URL {
  if (input.vercelEnv === "preview" && input.vercelBranchUrl) {
    return new URL(`https://${input.vercelBranchUrl}`);
  }

  return new URL(input.siteUrl);
}
