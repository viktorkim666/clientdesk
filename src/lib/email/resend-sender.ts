import { Resend } from "resend";
import { escapeHtml } from "@/lib/email/escape-html";
import type {
  EmailSender,
  SendInvitationEmailParams,
  SendProjectUpdateEmailParams,
} from "@/lib/email/types";

/** Sends transactional emails through Resend. Used only when RESEND_API_KEY is set. */
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
    async sendProjectUpdateEmail({
      to,
      workspaceName,
      projectName,
      body,
      projectUrl,
    }: SendProjectUpdateEmailParams) {
      // Same rule as above: the workspace name, project name and update body
      // are all user-typed, so each one is escaped before it reaches the
      // template. The body keeps its line breaks as `<br />` rather than
      // arbitrary HTML, since it is plain text everywhere else in the app.
      const safeWorkspaceName = escapeHtml(workspaceName);
      const safeProjectName = escapeHtml(projectName);
      const safeBody = escapeHtml(body).replace(/\n/g, "<br />");
      const safeProjectUrl = escapeHtml(projectUrl);

      const { error } = await resend.emails.send({
        from: "Clientdesk <onboarding@resend.dev>",
        to,
        subject: `New update on ${projectName} — ${workspaceName}`,
        html: `<p>New update on <strong>${safeProjectName}</strong> (${safeWorkspaceName}):</p><p>${safeBody}</p><p><a href="${safeProjectUrl}">View the project</a></p>`,
      });

      if (error) {
        throw new Error(
          `Failed to send project update email: ${error.message}`,
        );
      }
    },
  };
}
