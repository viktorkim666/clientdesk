import { describe, expect, it } from "vitest";
import { consoleEmailSender } from "@/lib/email/console-sender";
import { getEmailSender } from "@/lib/email";

describe("getEmailSender", () => {
  it("returns the console sender when no API key is given outside production", () => {
    expect(getEmailSender({ apiKey: undefined, nodeEnv: "test" })).toBe(
      consoleEmailSender,
    );
  });

  it("returns a Resend-backed sender when an API key is given", () => {
    const sender = getEmailSender({ apiKey: "re_test_key", nodeEnv: "test" });

    expect(sender).not.toBe(consoleEmailSender);
    expect(sender.sendInvitationEmail).toBeTypeOf("function");
    expect(sender.sendProjectUpdateEmail).toBeTypeOf("function");
  });

  it("returns a Resend-backed sender in production when an API key is given", () => {
    const sender = getEmailSender({
      apiKey: "re_test_key",
      nodeEnv: "production",
    });

    expect(sender).not.toBe(consoleEmailSender);
    expect(sender.sendInvitationEmail).toBeTypeOf("function");
  });

  it("fails loudly instead of writing invite links to disk in production without a key", async () => {
    const sender = getEmailSender({ apiKey: undefined, nodeEnv: "production" });

    expect(sender).not.toBe(consoleEmailSender);
    await expect(
      sender.sendInvitationEmail({
        to: "client@clientdesk.test",
        workspaceName: "Acme Agency",
        inviteUrl: "http://localhost:3000/invite/token-1",
      }),
    ).rejects.toThrow("Email is not configured");
    await expect(
      sender.sendProjectUpdateEmail({
        to: "client@clientdesk.test",
        workspaceName: "Acme Agency",
        projectName: "Website Redesign",
        body: "Kickoff call notes.",
        projectUrl: "http://localhost:3000/w/acme-agency/projects/project-1",
      }),
    ).rejects.toThrow("Email is not configured");
  });
});
