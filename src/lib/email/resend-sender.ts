import { Resend } from "resend";
import { escapeHtml } from "@/lib/email/escape-html";
import type { EmailSender, SendInvitationEmailParams } from "@/lib/email/types";

/** Sends invitation emails through Resend. Used only when RESEND_API_KEY is set. */
export function createResendEmailSender(apiKey: string): EmailSender {
  const resend = new Resend(apiKey);

  return {
    async sendInvitationEmail({
      to,
      workspaceName,
      inviteUrl,
    }: SendInvitationEmailParams) {
      // Every value below comes from user input (a workspace name someone
      // typed, an invite URL built from a token) and must be escaped before
      // it reaches the HTML template.
      const safeWorkspaceName = escapeHtml(workspaceName);
      const safeInviteUrl = escapeHtml(inviteUrl);

      const { error } = await resend.emails.send({
        from: "Clientdesk <onboarding@resend.dev>",
        to,
        subject: `You're invited to ${workspaceName} on Clientdesk`,
        html: `<p>You have been invited to join <strong>${safeWorkspaceName}</strong> on Clientdesk.</p><p><a href="${safeInviteUrl}">Accept the invitation</a></p>`,
      });

      if (error) {
        throw new Error(`Failed to send invitation email: ${error.message}`);
      }
    },
  };
}
