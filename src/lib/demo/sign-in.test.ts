import { describe, expect, it, vi } from "vitest";
import { signInAsDemoUser } from "./sign-in";

function deps(
  options: {
    linkError?: boolean;
    noProperties?: boolean;
    verifyError?: boolean;
  } = {},
) {
  const generateLink = vi.fn(() =>
    Promise.resolve(
      options.linkError
        ? { data: { properties: null }, error: { message: "no link" } }
        : {
            data: {
              properties: options.noProperties
                ? null
                : { hashed_token: "hash-abc" },
            },
            error: null,
          },
    ),
  );
  const verifyOtp = vi.fn(() =>
    Promise.resolve({
      error: options.verifyError ? { message: "expired" } : null,
    }),
  );
  return {
    generateLink,
    verifyOtp,
    admin: { auth: { admin: { generateLink } } },
    server: { auth: { verifyOtp } },
  };
}

describe("signInAsDemoUser", () => {
  it("exchanges the generated token hash for a session on the server client", async () => {
    const d = deps();

    await signInAsDemoUser(
      d.admin,
      d.server,
      "owner-x@demo.clientdesk.invalid",
    );

    expect(d.generateLink).toHaveBeenCalledWith({
      type: "magiclink",
      email: "owner-x@demo.clientdesk.invalid",
    });
    expect(d.verifyOtp).toHaveBeenCalledWith({
      type: "magiclink",
      token_hash: "hash-abc",
    });
  });

  it("throws when the link cannot be generated", async () => {
    const d = deps({ linkError: true });

    await expect(
      signInAsDemoUser(d.admin, d.server, "a@b.invalid"),
    ).rejects.toThrow();
    expect(d.verifyOtp).not.toHaveBeenCalled();
  });

  it("throws when the link has no token", async () => {
    const d = deps({ noProperties: true });

    await expect(
      signInAsDemoUser(d.admin, d.server, "a@b.invalid"),
    ).rejects.toThrow();
    expect(d.verifyOtp).not.toHaveBeenCalled();
  });

  it("throws when the token does not verify", async () => {
    const d = deps({ verifyError: true });

    await expect(
      signInAsDemoUser(d.admin, d.server, "a@b.invalid"),
    ).rejects.toThrow();
  });
});
