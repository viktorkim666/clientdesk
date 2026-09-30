import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createAdminClientMock,
  createClientMock,
  createSandboxMock,
  discardMock,
  signInMock,
  switchMock,
  headersMock,
  redirectMock,
  envMock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  createClientMock: vi.fn(),
  createSandboxMock: vi.fn(),
  discardMock: vi.fn(),
  signInMock: vi.fn(),
  switchMock: vi.fn(),
  headersMock: vi.fn(),
  redirectMock: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  envMock: ((): { DEMO_VISITOR_SALT?: string } => ({
    DEMO_VISITOR_SALT: "test-salt",
  }))(),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("next/headers", () => ({ headers: headersMock }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/env.server", () => ({ serverEnv: envMock }));
vi.mock("@/lib/demo/admin", () => ({
  toDemoAdminClient: (client: unknown) => client,
}));
vi.mock("@/lib/demo/sign-in", () => ({ signInAsDemoUser: signInMock }));
vi.mock("@/lib/demo/switch", () => ({ switchSandboxRole: switchMock }));
vi.mock("@/lib/demo/sandbox", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/demo/sandbox")>()),
  createSandbox: createSandboxMock,
}));

import { DemoError } from "@/lib/demo/sandbox";
import { startDemo, switchDemoRole } from "./actions";

const INITIAL = { ok: true } as const;
const SANDBOX = {
  workspaceSlug: "northwind-abc123",
  ownerEmail: "owner-1@demo.clientdesk.invalid",
  clientEmail: "client1-1@demo.clientdesk.invalid",
  discard: discardMock,
};

function form(role: string | null) {
  const data = new FormData();
  if (role !== null) data.set("role", role);
  return data;
}

async function redirectedTo(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  return error instanceof Error && error.message.startsWith("NEXT_REDIRECT:")
    ? error.message.slice("NEXT_REDIRECT:".length)
    : null;
}

const admin = { marker: "admin" };
const server = { auth: { getClaims: vi.fn() } };

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  envMock.DEMO_VISITOR_SALT = "test-salt";
  createAdminClientMock.mockReturnValue(admin);
  createClientMock.mockResolvedValue(server);
  createSandboxMock.mockResolvedValue(SANDBOX);
  discardMock.mockResolvedValue(undefined);
  signInMock.mockResolvedValue(undefined);
  headersMock.mockResolvedValue(
    new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
  );
  server.auth.getClaims.mockResolvedValue({
    data: { claims: { sub: "u-owner" } },
    error: null,
  });
});

describe("startDemo", () => {
  it("signs an agency visitor in as the owner and lands in the workspace", async () => {
    const path = await redirectedTo(startDemo(INITIAL, form("agency")));

    expect(path).toBe("/w/northwind-abc123");
    expect(signInMock).toHaveBeenCalledWith(admin, server, SANDBOX.ownerEmail);
  });

  it("signs a client visitor in as the first client", async () => {
    const path = await redirectedTo(startDemo(INITIAL, form("client")));

    expect(path).toBe("/w/northwind-abc123");
    expect(signInMock).toHaveBeenCalledWith(admin, server, SANDBOX.clientEmail);
  });

  it("passes a hash of the visitor, never the address, to the sandbox", async () => {
    await redirectedTo(startDemo(INITIAL, form("agency")));

    const hash = createSandboxMock.mock.calls[0][1] as string;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("203.0.113.7");
  });

  it.each([null, "admin", ""])("rejects the role %j", async (role) => {
    const state = await startDemo(INITIAL, form(role));

    expect(state.ok).toBe(false);
    expect(createSandboxMock).not.toHaveBeenCalled();
  });

  it("says the live demo isn't available without the admin key", async () => {
    createAdminClientMock.mockReturnValue(null);

    const state = await startDemo(INITIAL, form("agency"));

    expect(state).toEqual({
      ok: false,
      error: "The live demo isn't available here",
    });
  });

  it("says the live demo isn't available in production without a salt", async () => {
    vi.stubEnv("NODE_ENV", "production");
    envMock.DEMO_VISITOR_SALT = undefined;

    const state = await startDemo(INITIAL, form("agency"));

    expect(state).toEqual({
      ok: false,
      error: "The live demo isn't available here",
    });
    expect(createSandboxMock).not.toHaveBeenCalled();
  });

  it("maps the capacity error to a busy message", async () => {
    createSandboxMock.mockRejectedValue(
      new DemoError("capacity", "demo_capacity"),
    );

    const state = await startDemo(INITIAL, form("agency"));

    expect(state).toEqual({
      ok: false,
      error: "The demo is busy right now. Try again in a few minutes.",
    });
  });

  it("maps the visitor limit to an hour message", async () => {
    createSandboxMock.mockRejectedValue(
      new DemoError("visitor_limit", "demo_visitor_limit"),
    );

    const state = await startDemo(INITIAL, form("client"));

    expect(state).toEqual({
      ok: false,
      error: "You've started a few demos already. Try again in an hour.",
    });
  });

  it("shows a generic message for any other failure and does not sign in", async () => {
    createSandboxMock.mockRejectedValue(new DemoError("failed", "boom"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const state = await startDemo(INITIAL, form("agency"));

    expect(state).toEqual({
      ok: false,
      error: "The demo couldn't start. Try again in a minute.",
    });
    expect(signInMock).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it("shows the generic message when signing in fails", async () => {
    signInMock.mockRejectedValue(new Error("verify failed"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const state = await startDemo(INITIAL, form("agency"));

    expect(state).toEqual({
      ok: false,
      error: "The demo couldn't start. Try again in a minute.",
    });
    log.mockRestore();
  });

  it("deletes the sandbox it just made when signing in fails", async () => {
    signInMock.mockRejectedValue(new Error("verify failed"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    await startDemo(INITIAL, form("client"));

    expect(discardMock).toHaveBeenCalledOnce();
    log.mockRestore();
  });

  it("keeps the sandbox when signing in works", async () => {
    await redirectedTo(startDemo(INITIAL, form("agency")));

    expect(discardMock).not.toHaveBeenCalled();
  });
});

describe("switchDemoRole", () => {
  it("redirects to the path the switch resolves", async () => {
    switchMock.mockResolvedValue({ ok: true, path: "/w/northwind-abc123" });

    const path = await redirectedTo(switchDemoRole());

    expect(path).toBe("/w/northwind-abc123");
    expect(switchMock).toHaveBeenCalledWith(
      admin,
      server,
      "u-owner",
      expect.any(Date),
    );
  });

  it("returns the refusal message", async () => {
    switchMock.mockResolvedValue({
      ok: false,
      error: "This demo has expired.",
    });

    const state = await switchDemoRole();

    expect(state).toEqual({ ok: false, error: "This demo has expired." });
  });

  it("refuses a signed-out caller", async () => {
    server.auth.getClaims.mockResolvedValue({ data: null, error: null });

    const state = await switchDemoRole();

    expect(state.ok).toBe(false);
    expect(switchMock).not.toHaveBeenCalled();
  });

  it("says the live demo isn't available without the admin key", async () => {
    createAdminClientMock.mockReturnValue(null);

    const state = await switchDemoRole();

    expect(state).toEqual({
      ok: false,
      error: "The live demo isn't available here",
    });
  });
});
