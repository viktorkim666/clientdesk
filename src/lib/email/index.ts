import { env } from "@/lib/env";
import { consoleEmailSender } from "@/lib/email/console-sender";
import { withoutDemoRecipients } from "@/lib/email/demo-recipients";
import { createResendEmailSender } from "@/lib/email/resend-sender";
import { unconfiguredEmailSender } from "@/lib/email/unconfigured-sender";
import type { EmailSender } from "@/lib/email/types";

export type {
  EmailSender,
  SendInvitationEmailParams,
  SendProjectUpdateEmailParams,
} from "@/lib/email/types";

type EmailConfig = { apiKey?: string; nodeEnv?: string };

/**
 * How an email leaves the app: `provider` (Resend, a real delivery),
 * `console` (written to `.local/emails.jsonl`, nobody receives it) or `none`
 * (production without a key, sending fails). Callers that hand the invite
 * link to the owner instead of relying on the email use this.
 */
export type EmailDelivery = "provider" | "console" | "none";

export function getEmailDelivery({
  apiKey = env.RESEND_API_KEY,
  nodeEnv = process.env.NODE_ENV,
}: EmailConfig = {}): EmailDelivery {
  if (apiKey) return "provider";
  return nodeEnv === "production" ? "none" : "console";
}

/**
 * Picks the email backend by whether `RESEND_API_KEY` is set (mirrors
 * `getDraftGenerator`). With a key, Resend is used everywhere. Without one,
 * the console sender is used outside production so local work and CI run
 * the whole flow without a key; in production without a key, the returned
 * sender rejects instead of writing invite links to disk - callers already
 * report that as "could not send the invitation".
 *
 * Every sender goes through `withoutDemoRecipients`, so mail to sandbox
 * users is dropped in this one place.
 */
export function getEmailSender({
  apiKey = env.RESEND_API_KEY,
  nodeEnv = process.env.NODE_ENV,
}: EmailConfig = {}): EmailSender {
  if (apiKey) {
    return withoutDemoRecipients(createResendEmailSender(apiKey));
  }
  return withoutDemoRecipients(
    nodeEnv === "production" ? unconfiguredEmailSender : consoleEmailSender,
  );
}
