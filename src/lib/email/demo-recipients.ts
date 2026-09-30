import { DEMO_EMAIL_DOMAIN } from "@/lib/demo/email-domain";
import type { EmailSender } from "@/lib/email/types";

const DEMO_ADDRESS_SUFFIX = `@${DEMO_EMAIL_DOMAIN}`;

/**
 * True for an address on the demo domain, the one every sandbox user has.
 * This is the last line of defence: `postUpdate` already skips sending in a
 * sandbox workspace, and the database refuses to change a demo user's
 * address, so a demo user cannot be given a real one.
 */
export function isDemoRecipient(address: string): boolean {
  return address.trim().toLowerCase().endsWith(DEMO_ADDRESS_SUFFIX);
}

/**
 * Wraps a sender so a message addressed to a sandbox user is dropped before it
 * reaches the backend. Each message has one recipient, so "nothing left to
 * send" means the backend is not called at all.
 */
export function withoutDemoRecipients(sender: EmailSender): EmailSender {
  return {
    async sendInvitationEmail(params) {
      if (isDemoRecipient(params.to)) return;
      await sender.sendInvitationEmail(params);
    },
    async sendProjectUpdateEmail(params) {
      if (isDemoRecipient(params.to)) return;
      await sender.sendProjectUpdateEmail(params);
    },
  };
}
