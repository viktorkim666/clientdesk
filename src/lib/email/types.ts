export type SendInvitationEmailParams = {
  to: string;
  workspaceName: string;
  inviteUrl: string;
};

export type SendProjectUpdateEmailParams = {
  to: string;
  workspaceName: string;
  projectName: string;
  body: string;
  projectUrl: string;
};

/** Any transactional email backend implements this — console locally/in tests, Resend in production. */
export interface EmailSender {
  sendInvitationEmail: (params: SendInvitationEmailParams) => Promise<void>;
  sendProjectUpdateEmail: (
    params: SendProjectUpdateEmailParams,
  ) => Promise<void>;
}
