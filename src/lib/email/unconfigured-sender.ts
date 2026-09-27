import type { EmailSender } from "@/lib/email/types";

/**
 * Used in production when `RESEND_API_KEY` isn't set. The console sender
 * (see `console-sender.ts`) writes invite links and update bodies to
 * `.local/emails.jsonl`, which is fine for local dev but not something to
 * fall back to in production - it would silently hand out invite tokens
 * with no working email behind them. This fails loudly instead, mirroring
 * `getDraftGenerator`'s `null` for the same situation; callers already
 * treat a rejected send as "could not send" (see `inviteMember` and
 * `postProjectUpdate`).
 */
function sendNotConfigured(): Promise<never> {
  return Promise.reject(
    new Error(
      "Email is not configured: set RESEND_API_KEY to send email in production.",
    ),
  );
}

export const unconfiguredEmailSender: EmailSender = {
  sendInvitationEmail: sendNotConfigured,
  sendProjectUpdateEmail: sendNotConfigured,
};
