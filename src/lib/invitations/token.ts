import { randomBytes, createHash } from "node:crypto";

/**
 * A URL-safe invitation token to embed in the /invite/[token] link. Only its
 * SHA-256 hash is ever stored (see hashInvitationToken); the raw token exists
 * only in the emailed link.
 */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Matches `encode(extensions.digest(p_token, 'sha256'), 'hex')` in
 * accept_invitation() (supabase/migrations), so a token generated here can be
 * looked up by its hash in the database.
 */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
