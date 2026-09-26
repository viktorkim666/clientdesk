import { describe, expect, it } from "vitest";
import { consoleEmailSender } from "@/lib/email/console-sender";
import { getEmailSender } from "@/lib/email";

describe("getEmailSender", () => {
  it("returns the console sender when no API key is given", () => {
    expect(getEmailSender(undefined)).toBe(consoleEmailSender);
  });

  it("returns a Resend-backed sender when an API key is given", () => {
    const sender = getEmailSender("re_test_key");

    expect(sender).not.toBe(consoleEmailSender);
    expect(sender.sendInvitationEmail).toBeTypeOf("function");
  });
});
