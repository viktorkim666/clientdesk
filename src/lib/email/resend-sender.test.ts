import { beforeEach, describe, expect, it, vi } from "vitest";

type SendPayload = { from: string; to: string; subject: string; html: string };
type SendResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { message: string } };

const { sendMock } = vi.hoisted(() => ({
  sendMock: vi.fn<(payload: SendPayload) => Promise<SendResult>>(async () => ({
    data: { id: "email-1" },
    error: null,
  })),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import { createResendEmailSender } from "@/lib/email/resend-sender";

describe("createResendEmailSender", () => {
  beforeEach(() => {
    sendMock.mockClear();
  });

  it("HTML-escapes the workspace name and the invite url before sending", async () => {
    const sender = createResendEmailSender("re_test_key");

    await sender.sendInvitationEmail({
      to: "client@example.com",
      workspaceName: `Acme & "Sons" <script>alert(1)</script>`,
      inviteUrl: `https://example.com/invite/abc"><script>alert(2)</script>`,
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const html = sendMock.mock.calls[0][0].html;

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Acme &amp; &quot;Sons&quot;");
    // The href attribute itself must not be breakable out of.
    expect(html).toMatch(
      /href="https:\/\/example\.com\/invite\/abc&quot;[^"]*"/,
    );
  });

  it("throws when Resend returns an error", async () => {
    sendMock.mockResolvedValueOnce({
      data: null,
      error: { message: "bad request" },
    });
    const sender = createResendEmailSender("re_test_key");

    await expect(
      sender.sendInvitationEmail({
        to: "client@example.com",
        workspaceName: "Acme Agency",
        inviteUrl: "https://example.com/invite/abc",
      }),
    ).rejects.toThrow(/bad request/);
  });
});
