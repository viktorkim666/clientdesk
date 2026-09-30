import "server-only";
import type { DemoAdminClient } from "./admin";

/**
 * The one call `signInAsDemoUser` makes on the request's server client.
 * `verifyOtp` writes the session cookies through the client's cookie hooks.
 */
export interface DemoServerClient {
  auth: {
    verifyOtp: (params: {
      type: "magiclink";
      token_hash: string;
    }) => PromiseLike<{ error: { message: string } | null }>;
  };
}

export type DemoLinkAdmin = {
  auth: { admin: Pick<DemoAdminClient["auth"]["admin"], "generateLink"> };
};

/**
 * Signs the request in as a sandbox user without a password or an email: the
 * admin API generates a magic link (nothing is sent), and the server client
 * trades its token hash for a session.
 */
export async function signInAsDemoUser(
  admin: DemoLinkAdmin,
  server: DemoServerClient,
  email: string,
): Promise<void> {
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data.properties) {
    throw new Error(`Could not generate a sign-in link: ${error?.message}`);
  }

  const { error: verifyError } = await server.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (verifyError) {
    throw new Error(`Could not sign in: ${verifyError.message}`);
  }
}
