import { env } from "@/lib/env";
import { consoleEmailSender } from "@/lib/email/console-sender";
import { createResendEmailSender } from "@/lib/email/resend-sender";
import { unconfiguredEmailSender } from "@/lib/email/unconfigured-sender";
import type { EmailSender } from "@/lib/email/types";

export type {
  EmailSender,
  SendInvitationEmailParams,
  SendProjectUpdateEmailParams,
} from "@/lib/email/types";

/**
 * Picks the email backend by whether `RESEND_API_KEY` is set (mirrors
 * `getDraftGenerator`). With a key, Resend is used everywhere. Without one,
 * the console sender is used outside production so local work and CI run
 * the whole flow without a key; in production without a key, the returned
 * sender rejects instead of writing invite links to disk - callers already
 * report that as "could not send the invitation".
 */
export function getEmailSender({
  apiKey = env.RESEND_API_KEY,
  nodeEnv = process.env.NODE_ENV,
}: { apiKey?: string; nodeEnv?: string } = {}): EmailSender {
  if (apiKey) {
    return createResendEmailSender(apiKey);
  }
  return nodeEnv === "production"
    ? unconfiguredEmailSender
    : consoleEmailSender;
}
