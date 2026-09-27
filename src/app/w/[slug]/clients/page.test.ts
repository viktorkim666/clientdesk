import { beforeEach, describe, expect, it, vi } from "vitest";

const WORKSPACE_ID = "a0000000-0000-4000-8000-000000000001";
const WORKSPACE_SLUG = "acme-agency";

const { getCurrentWorkspaceMock, createClientMock } = vi.hoisted(() => ({
  getCurrentWorkspaceMock: vi.fn(),
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: createClientMock }));
vi.mock("@/lib/workspace/current", () => ({
  getCurrentWorkspace: getCurrentWorkspaceMock,
}));

import ClientsPage from "./page";

function workspace() {
  return {
    id: WORKSPACE_ID,
    name: "Acme Agency",
    slug: WORKSPACE_SLUG,
    role: "owner" as const,
    clientId: null,
    userId: "00000001-0000-4000-8000-000000000001",
  };
}

/** Resolves only once `resolve()` is called, so the test can prove a
 * producer function ran before its result was awaited. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentWorkspaceMock.mockResolvedValue(workspace());
});

describe("ClientsPage", () => {
  it("starts the clients and billing reads together instead of one after the other", async () => {
    const clientsDeferred = deferred<{
      data: { id: string; name: string }[];
    }>();
    const billingDeferred = deferred<{ count: number }>();
    let clientsQueryStarted = false;
    let billingQueryStarted = false;

    createClientMock.mockResolvedValue({
      from: (table: string) => {
        if (table === "clients") {
          return {
            select: () => ({
              eq: () => ({
                order: () => {
                  // Marks the moment the clients query is actually issued,
                  // not the moment its result is awaited.
                  clientsQueryStarted = true;
                  return clientsDeferred.promise;
                },
              }),
            }),
          };
        }
        if (table === "workspace_billing") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => {
                  billingQueryStarted = true;
                  return billingDeferred.promise;
                },
              }),
            }),
          };
        }
        throw new Error(`from() was not stubbed for table "${table}"`);
      },
    });

    const pagePromise = ClientsPage({
      params: Promise.resolve({ slug: WORKSPACE_SLUG }),
    });

    // Let the microtask queue run up to the point both reads are issued,
    // without letting either resolve. Sequential `await`s would only have
    // started the clients query by now; `Promise.all` starts both.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(clientsQueryStarted).toBe(true);
    expect(billingQueryStarted).toBe(true);

    clientsDeferred.resolve({ data: [{ id: "c1", name: "Client One Co." }] });
    billingDeferred.resolve({ count: 0 });

    const result = await pagePromise;
    expect(result).toBeTruthy();
  });
});
