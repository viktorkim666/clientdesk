import { env } from "@/lib/env";
import { consoleEmailSender } from "@/lib/email/console-sender";
import { createResendEmailSender } from "@/lib/email/resend-sender";
import type { EmailSender } from "@/lib/email/types";

export type {
  EmailSender,
  SendInvitationEmailParams,
  SendProjectUpdateEmailParams,
} from "@/lib/email/types";

/**
 * The console sender is used locally and in tests/CI (no RESEND_API_KEY);
 * Resend is used in any environment where it is set.
 */
export function getEmailSender(
  apiKey: string | undefined = env.RESEND_API_KEY,
): EmailSender {
  return apiKey ? createResendEmailSender(apiKey) : consoleEmailSender;
}
