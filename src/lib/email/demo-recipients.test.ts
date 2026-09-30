import { describe, expect, it, vi } from "vitest";
import {
  isDemoRecipient,
  withoutDemoRecipients,
} from "@/lib/email/demo-recipients";
import { DEMO_EMAIL_DOMAIN } from "@/lib/demo/email-domain";
import type { EmailSender } from "@/lib/email/types";

function fakeSender() {
  const sendInvitationEmail = vi.fn<EmailSender["sendInvitationEmail"]>();
  const sendProjectUpdateEmail = vi.fn<EmailSender["sendProjectUpdateEmail"]>();
  const sender: EmailSender = { sendInvitationEmail, sendProjectUpdateEmail };
  return { sender, sendInvitationEmail, sendProjectUpdateEmail };
}

const invitation = (to: string) => ({
  to,
  workspaceName: "Acme Agency",
  inviteUrl: "http://localhost:3000/invite/token-1",
});

const update = (to: string) => ({
  to,
  workspaceName: "Acme Agency",
  projectName: "Website Redesign",
  body: "Kickoff call notes.",
  projectUrl: "http://localhost:3000/w/acme/projects/p1",
});

describe("isDemoRecipient", () => {
  it("recognises the shared demo email domain constant", () => {
    expect(DEMO_EMAIL_DOMAIN).toBe("demo.clientdesk.invalid");
    expect(isDemoRecipient(`owner-1@${DEMO_EMAIL_DOMAIN}`)).toBe(true);
    expect(isDemoRecipient(`owner-1@x${DEMO_EMAIL_DOMAIN}`)).toBe(false);
  });

  it.each([
    "maya@demo.clientdesk.invalid",
    "MAYA@DEMO.CLIENTDESK.INVALID",
    "  maya@demo.clientdesk.invalid  ",
  ])("treats %j as a demo address", (address) => {
    expect(isDemoRecipient(address)).toBe(true);
  });

  it.each([
    "maya@clientdesk.test",
    "maya@example.com",
    "maya@demo.clientdesk.invalid.example.com",
    "maya@notdemo.clientdesk.invalid",
    "",
  ])("does not treat %j as a demo address", (address) => {
    expect(isDemoRecipient(address)).toBe(false);
  });
});

describe("withoutDemoRecipients", () => {
  it("passes invitations to real addresses through unchanged", async () => {
    const { sender, sendInvitationEmail } = fakeSender();

    await withoutDemoRecipients(sender).sendInvitationEmail(
      invitation("client@example.com"),
    );

    expect(sendInvitationEmail).toHaveBeenCalledExactlyOnceWith(
      invitation("client@example.com"),
    );
  });

  it("does not call the provider for an invitation to a demo address", async () => {
    const { sender, sendInvitationEmail } = fakeSender();

    await withoutDemoRecipients(sender).sendInvitationEmail(
      invitation("Maya@Demo.Clientdesk.Invalid"),
    );

    expect(sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("passes project updates to real addresses through unchanged", async () => {
    const { sender, sendProjectUpdateEmail } = fakeSender();

    await withoutDemoRecipients(sender).sendProjectUpdateEmail(
      update("client@example.com"),
    );

    expect(sendProjectUpdateEmail).toHaveBeenCalledExactlyOnceWith(
      update("client@example.com"),
    );
  });

  it("does not call the provider for a project update to a demo address", async () => {
    const { sender, sendProjectUpdateEmail } = fakeSender();

    await withoutDemoRecipients(sender).sendProjectUpdateEmail(
      update("client@demo.clientdesk.invalid"),
    );

    expect(sendProjectUpdateEmail).not.toHaveBeenCalled();
  });

  it("still rejects when the wrapped sender rejects", async () => {
    const { sender, sendInvitationEmail } = fakeSender();
    sendInvitationEmail.mockRejectedValueOnce(new Error("provider down"));

    await expect(
      withoutDemoRecipients(sender).sendInvitationEmail(
        invitation("client@example.com"),
      ),
    ).rejects.toThrow("provider down");
  });
});
