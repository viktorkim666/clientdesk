import { beforeEach, describe, expect, it, vi } from "vitest";

const { serverEnvMock, createAdminClientMock, getStripeMock, cleanupMock } =
  vi.hoisted(() => {
    const serverEnv: { CRON_SECRET: string | undefined } = {
      CRON_SECRET: "cron-secret-value",
    };
    return {
      serverEnvMock: serverEnv,
      createAdminClientMock: vi.fn<() => object | null>(),
      getStripeMock: vi.fn<() => object | null>(),
      cleanupMock: vi.fn(),
    };
  });

vi.mock("@/lib/env.server", () => ({ serverEnv: serverEnvMock }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));
vi.mock("@/lib/billing/stripe", () => ({ getStripe: getStripeMock }));
vi.mock("@/lib/demo/cleanup", () => ({ cleanupExpiredDemos: cleanupMock }));
vi.mock("@/lib/demo/admin", () => ({
  toDemoAdminClient: (client: unknown) => client,
}));

import { GET, dynamic, maxDuration } from "./route";

const URL = "http://localhost:3000/api/cron/cleanup-demo";

function request(authorization?: string) {
  return new Request(URL, {
    headers: authorization ? { authorization } : {},
  });
}

const CLEAN_RESULT = {
  ok: true,
  rounds: 1,
  sandboxesFinished: 2,
  sandboxesPending: 0,
  draftRequestsDeleted: 1,
  usersDeleted: 8,
  storageObjectsRemoved: 16,
  stripeCustomersDeleted: 0,
  stripeCustomersSkipped: 0,
  failures: {
    database: null,
    finish: null,
    users: [],
    storageBatches: 0,
    stripeCustomers: [],
  },
};

describe("GET /api/cron/cleanup-demo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverEnvMock.CRON_SECRET = "cron-secret-value";
    createAdminClientMock.mockReturnValue({ fake: "admin" });
    getStripeMock.mockReturnValue(null);
    cleanupMock.mockResolvedValue(CLEAN_RESULT);
  });

  it("is never cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("allows the run enough time for several batches", () => {
    expect(maxDuration).toBe(60);
  });

  it("returns 503 when CRON_SECRET is not configured, even with a header", async () => {
    serverEnvMock.CRON_SECRET = undefined;

    const response = await GET(request("Bearer anything"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Cron is not configured" });
    expect(cleanupMock).not.toHaveBeenCalled();
  });

  it("returns 401 without an Authorization header", async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(cleanupMock).not.toHaveBeenCalled();
  });

  it.each([
    "Bearer wrong-secret",
    "Bearer cron-secret-valu",
    "Bearer cron-secret-value-extra",
    "cron-secret-value",
    "Basic cron-secret-value",
    "Bearer ",
  ])("returns 401 for the header %j", async (header) => {
    const response = await GET(request(header));

    expect(response.status).toBe(401);
    expect(cleanupMock).not.toHaveBeenCalled();
  });

  it("returns 503 when the admin client is not configured", async () => {
    createAdminClientMock.mockReturnValue(null);

    const response = await GET(request("Bearer cron-secret-value"));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Supabase admin client is not configured",
    });
    expect(cleanupMock).not.toHaveBeenCalled();
  });

  it("runs the cleanup with the admin client and Stripe, and returns the counts", async () => {
    const stripe = { customers: {} };
    getStripeMock.mockReturnValue(stripe);

    const response = await GET(request("Bearer cron-secret-value"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(CLEAN_RESULT);
    expect(cleanupMock).toHaveBeenCalledWith({
      admin: { fake: "admin" },
      stripe,
    });
  });

  it("returns 500 with the failures in the body when part of the cleanup failed", async () => {
    const partial = {
      ...CLEAN_RESULT,
      ok: false,
      sandboxesFinished: 1,
      sandboxesPending: 1,
      failures: { ...CLEAN_RESULT.failures, users: ["u2"] },
    };
    cleanupMock.mockResolvedValue(partial);

    const response = await GET(request("Bearer cron-secret-value"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(partial);
  });

  it("does not echo the secret in any response", async () => {
    const responses = [
      await GET(request("Bearer wrong")),
      await GET(request("Bearer cron-secret-value")),
    ];

    for (const response of responses) {
      expect(await response.text()).not.toContain("cron-secret-value");
    }
  });
});
