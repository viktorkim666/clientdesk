export type SendInvitationEmailParams = {
  to: string;
  workspaceName: string;
  inviteUrl: string;
};

/** Any invitation email backend implements this — console locally/in tests, Resend in production. */
export interface EmailSender {
  sendInvitationEmail: (params: SendInvitationEmailParams) => Promise<void>;
}
