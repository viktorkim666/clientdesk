import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailSender } from "@/lib/email/types";

const { deleteEqSpy, sendInvitationEmailMock, revalidatePathMock } = vi.hoisted(
  () => ({
    deleteEqSpy: vi.fn(() => ({ error: null })),
    sendInvitationEmailMock: vi.fn<EmailSender["sendInvitationEmail"]>(),
    revalidatePathMock: vi.fn(),
  }),
);

vi.mock("next/cache", () => ({ revalidatePath: revalidatePathMock }));

vi.mock("@/lib/email", () => ({
  getEmailSender: () => ({ sendInvitationEmail: sendInvitationEmailMock }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => ({
    auth: {
      getClaims: () => ({
        data: { claims: { sub: "00000001-0000-0000-0000-000000000001" } },
      }),
    },
    from: () => ({
      insert: () => ({
        select: () => ({
          single: () => ({ data: { id: "invitation-1" }, error: null }),
        }),
      }),
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
    sendInvitationEmailMock.mockReset();
    revalidatePathMock.mockClear();
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
});
