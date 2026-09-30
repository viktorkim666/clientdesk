import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailSender } from "@/lib/email/types";

const {
  deleteEqSpy,
  insertSpy,
  sendInvitationEmailMock,
  revalidatePathMock,
  getEmailDeliveryMock,
  isDemoWorkspaceMock,
} = vi.hoisted(() => ({
  deleteEqSpy: vi.fn<() => { error: { message: string } | null }>(() => ({
    error: null,
  })),
  insertSpy: vi.fn(),
  sendInvitationEmailMock: vi.fn<EmailSender["sendInvitationEmail"]>(),
  revalidatePathMock: vi.fn(),
  getEmailDeliveryMock: vi.fn<() => "provider" | "console" | "none">(),
  isDemoWorkspaceMock: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

vi.mock("@/lib/email", () => ({
  getEmailSender: () => ({ sendInvitationEmail: sendInvitationEmailMock }),
  getEmailDelivery: getEmailDeliveryMock,
}));

vi.mock("@/lib/demo/is-demo-workspace", () => ({
  isDemoWorkspace: isDemoWorkspaceMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getClaims: () => ({
        data: { claims: { sub: "00000001-0000-0000-0000-000000000001" } },
      }),
    },
    from: () => ({
      insert: (row: unknown) => {
        insertSpy(row);
        return {
          select: () => ({
            single: () => ({ data: { id: "invitation-1" }, error: null }),
          }),
        };
      },
      delete: () => ({
        eq: deleteEqSpy,
      }),
    }),
  }),
}));

import { inviteMember } from "./actions";

function buildFormData(): FormData {
  const formData = new FormData();
  formData.set("email", "client@example.com");
  formData.set("role", "client");
  formData.set("clientId", "bab4cc25-726d-4fe0-a153-91d24fe07f10");
  return formData;
}

describe("inviteMember", () => {
  beforeEach(() => {
    deleteEqSpy.mockClear();
    insertSpy.mockClear();
    sendInvitationEmailMock.mockReset();
    revalidatePathMock.mockClear();
    getEmailDeliveryMock.mockReset().mockReturnValue("provider");
    isDemoWorkspaceMock.mockReset().mockResolvedValue(false);
  });

  it("deletes the invitation and returns an error when the email send fails", async () => {
    sendInvitationEmailMock.mockRejectedValueOnce(new Error("Resend is down"));
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await inviteMember(
      "workspace-1",
      "acme-agency",
      "Acme Agency",
      buildFormData(),
    );

    expect(result).toEqual({
      ok: false,
      error: "Could not send the invitation email. Try again.",
    });
    expect(deleteEqSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "inviteMember action: sendInvitationEmail failed",
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });

  it("logs a failed invitation delete and still reports the send failure", async () => {
    sendInvitationEmailMock.mockRejectedValueOnce(new Error("Resend is down"));
    deleteEqSpy.mockReturnValueOnce({ error: { message: "rls denied" } });
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const result = await inviteMember(
      "workspace-1",
      "acme-agency",
      "Acme Agency",
      buildFormData(),
    );

    expect(result).toEqual({
      ok: false,
      error: "Could not send the invitation email. Try again.",
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "inviteMember action: could not delete the invitation",
      { message: "rls denied" },
    );

    consoleErrorSpy.mockRestore();
  });

  it("does not delete the invitation and returns ok when the email send succeeds", async () => {
    sendInvitationEmailMock.mockResolvedValueOnce(undefined);

    const result = await inviteMember(
      "workspace-1",
      "acme-agency",
      "Acme Agency",
      buildFormData(),
    );

    expect(result).toEqual({ ok: true });
    expect(deleteEqSpy).not.toHaveBeenCalled();
  });

  it("builds the invite url from the configured site url, not request headers", async () => {
    // NEXT_PUBLIC_SITE_URL is fixed in vitest.config.mts; this action never
    // imports next/headers, so there is nothing a spoofed Host/Origin header
    // could influence here.
    sendInvitationEmailMock.mockResolvedValueOnce(undefined);

    await inviteMember(
      "workspace-1",
      "acme-agency",
      "Acme Agency",
      buildFormData(),
    );

    expect(sendInvitationEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        inviteUrl: expect.stringMatching(
          /^http:\/\/localhost:3000\/invite\/.+/,
        ) as string,
      }),
    );
  });

  describe("inside a demo workspace", () => {
    it("refuses on the server, before creating an invitation or sending mail", async () => {
      isDemoWorkspaceMock.mockResolvedValueOnce(true);

      const result = await inviteMember(
        "workspace-1",
        "acme-agency",
        "Acme Agency",
        buildFormData(),
      );

      expect(result).toEqual({
        ok: false,
        error: "Invites are turned off in the demo workspace.",
      });
      expect(insertSpy).not.toHaveBeenCalled();
      expect(sendInvitationEmailMock).not.toHaveBeenCalled();
    });

    it("refuses when the sandbox check itself fails", async () => {
      isDemoWorkspaceMock.mockRejectedValueOnce(new Error("lookup failed"));
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      const result = await inviteMember(
        "workspace-1",
        "acme-agency",
        "Acme Agency",
        buildFormData(),
      );

      expect(result.ok).toBe(false);
      expect(insertSpy).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe("when an email provider is configured", () => {
    it("does not return the invite link", async () => {
      sendInvitationEmailMock.mockResolvedValueOnce(undefined);

      const result = await inviteMember(
        "workspace-1",
        "acme-agency",
        "Acme Agency",
        buildFormData(),
      );

      expect(result).toEqual({ ok: true });
    });
  });

  describe("when the email is not delivered by a provider", () => {
    it("sends through the console sender and returns the absolute invite link", async () => {
      getEmailDeliveryMock.mockReturnValue("console");
      sendInvitationEmailMock.mockResolvedValueOnce(undefined);

      const result = await inviteMember(
        "workspace-1",
        "acme-agency",
        "Acme Agency",
        buildFormData(),
      );

      expect(result).toEqual({
        ok: true,
        inviteUrl: expect.stringMatching(
          /^http:\/\/localhost:3000\/invite\/.+/,
        ) as string,
      });
      expect(sendInvitationEmailMock).toHaveBeenCalledTimes(1);
    });

    it("succeeds without sending when no sender exists (production without a key)", async () => {
      getEmailDeliveryMock.mockReturnValue("none");

      const result = await inviteMember(
        "workspace-1",
        "acme-agency",
        "Acme Agency",
        buildFormData(),
      );

      expect(result).toEqual({
        ok: true,
        inviteUrl: expect.stringMatching(
          /^http:\/\/localhost:3000\/invite\/.+/,
        ) as string,
      });
      expect(sendInvitationEmailMock).not.toHaveBeenCalled();
      expect(deleteEqSpy).not.toHaveBeenCalled();
      expect(revalidatePathMock).toHaveBeenCalledWith(
        "/w/acme-agency/settings/members",
      );
    });

    it("returns the same link that was sent to the console sender", async () => {
      getEmailDeliveryMock.mockReturnValue("console");
      sendInvitationEmailMock.mockResolvedValueOnce(undefined);

      const result = await inviteMember(
        "workspace-1",
        "acme-agency",
        "Acme Agency",
        buildFormData(),
      );

      const sent = sendInvitationEmailMock.mock.calls[0]?.[0];
      expect(result.ok && result.inviteUrl).toBe(sent?.inviteUrl);
    });
  });
});
