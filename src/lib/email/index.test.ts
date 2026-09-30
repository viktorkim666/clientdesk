import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailSender } from "@/lib/email/types";

const { consoleSender, resendSender, unconfiguredSender, createResendMock } =
  vi.hoisted(() => {
    const makeSender = () => ({
      sendInvitationEmail: vi.fn(() => Promise.resolve()),
      sendProjectUpdateEmail: vi.fn(() => Promise.resolve()),
    });
    const resend = makeSender();
    return {
      consoleSender: makeSender(),
      resendSender: resend,
      unconfiguredSender: {
        sendInvitationEmail: vi.fn(() =>
          Promise.reject(new Error("Email is not configured")),
        ),
        sendProjectUpdateEmail: vi.fn(() =>
          Promise.reject(new Error("Email is not configured")),
        ),
      },
      createResendMock: vi.fn<(apiKey: string) => EmailSender>(() => resend),
    };
  });

vi.mock("@/lib/email/console-sender", () => ({
  consoleEmailSender: consoleSender,
}));
vi.mock("@/lib/email/resend-sender", () => ({
  createResendEmailSender: createResendMock,
}));
vi.mock("@/lib/email/unconfigured-sender", () => ({
  unconfiguredEmailSender: unconfiguredSender,
}));

import { getEmailDelivery, getEmailSender } from "@/lib/email";

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
  projectUrl: "http://localhost:3000/w/acme-agency/projects/project-1",
});

describe("getEmailSender", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the console sender when no API key is given outside production", async () => {
    const sender = getEmailSender({ apiKey: undefined, nodeEnv: "test" });

    await sender.sendInvitationEmail(invitation("client@clientdesk.test"));

    expect(consoleSender.sendInvitationEmail).toHaveBeenCalledTimes(1);
    expect(createResendMock).not.toHaveBeenCalled();
  });

  it("uses a Resend-backed sender when an API key is given", async () => {
    const sender = getEmailSender({ apiKey: "re_test_key", nodeEnv: "test" });

    await sender.sendInvitationEmail(invitation("client@clientdesk.test"));
    await sender.sendProjectUpdateEmail(update("client@clientdesk.test"));

    expect(createResendMock).toHaveBeenCalledWith("re_test_key");
    expect(resendSender.sendInvitationEmail).toHaveBeenCalledTimes(1);
    expect(resendSender.sendProjectUpdateEmail).toHaveBeenCalledTimes(1);
    expect(consoleSender.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it("uses a Resend-backed sender in production when an API key is given", async () => {
    const sender = getEmailSender({
      apiKey: "re_test_key",
      nodeEnv: "production",
    });

    await sender.sendInvitationEmail(invitation("client@clientdesk.test"));

    expect(resendSender.sendInvitationEmail).toHaveBeenCalledTimes(1);
  });

  it("fails loudly instead of writing invite links to disk in production without a key", async () => {
    const sender = getEmailSender({ apiKey: undefined, nodeEnv: "production" });

    await expect(
      sender.sendInvitationEmail(invitation("client@clientdesk.test")),
    ).rejects.toThrow("Email is not configured");
    await expect(
      sender.sendProjectUpdateEmail(update("client@clientdesk.test")),
    ).rejects.toThrow("Email is not configured");
    expect(consoleSender.sendInvitationEmail).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "the console sender",
      apiKey: undefined,
      nodeEnv: "test",
      backend: consoleSender,
    },
    {
      name: "Resend",
      apiKey: "re_test_key",
      nodeEnv: "production",
      backend: resendSender,
    },
  ])(
    "drops demo recipients before $name is reached",
    async ({ apiKey, nodeEnv, backend }) => {
      const sender = getEmailSender({ apiKey, nodeEnv });

      await sender.sendInvitationEmail(
        invitation("maya@demo.clientdesk.invalid"),
      );
      await sender.sendProjectUpdateEmail(
        update("client@demo.clientdesk.invalid"),
      );

      expect(backend.sendInvitationEmail).not.toHaveBeenCalled();
      expect(backend.sendProjectUpdateEmail).not.toHaveBeenCalled();
    },
  );
});

describe("getEmailDelivery", () => {
  it("is provider when an API key is set, in any environment", () => {
    expect(getEmailDelivery({ apiKey: "re_test_key", nodeEnv: "test" })).toBe(
      "provider",
    );
    expect(
      getEmailDelivery({ apiKey: "re_test_key", nodeEnv: "production" }),
    ).toBe("provider");
  });

  it("is console without a key outside production", () => {
    expect(getEmailDelivery({ apiKey: undefined, nodeEnv: "test" })).toBe(
      "console",
    );
    expect(
      getEmailDelivery({ apiKey: undefined, nodeEnv: "development" }),
    ).toBe("console");
  });

  it("is none without a key in production", () => {
    expect(getEmailDelivery({ apiKey: undefined, nodeEnv: "production" })).toBe(
      "none",
    );
  });
});
