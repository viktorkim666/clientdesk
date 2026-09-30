import "server-only";
import { z } from "zod";
import type { CleanupAdminClient, Failure } from "./admin";

// Storage `remove` takes a list; a few hundred paths in one request is a
// needlessly big URL/body, so the paths go in batches.
const STORAGE_BATCH_SIZE = 100;
const STORAGE_BUCKET = "project-files";

// User and Stripe deletions are one request each. A few at a time is much
// faster than one at a time and still gentle on the auth API and on Stripe.
const PARALLEL_DELETES = 10;

// `delete_expired_demo_sandboxes` returns at most this many sandboxes per
// call (25 in the function). A full batch means there may be more, so the run
// asks again, up to MAX_ROUNDS times, which bounds the run's length (the
// route's `maxDuration`) and covers the 300 live sandboxes the caps allow.
// Whatever is left is picked up by the next run.
const BATCH_SIZE = 25;
const MAX_ROUNDS = 12;

/** The one Stripe call the cleanup makes. The real `Stripe` client satisfies it. */
export interface CleanupStripeClient {
  customers: { del: (id: string) => PromiseLike<unknown> };
}

const rpcResultSchema = z.object({
  sandboxes: z.array(
    z.object({
      id: z.string(),
      user_ids: z.array(z.string()),
      storage_paths: z.array(z.string()),
      stripe_customer_ids: z.array(z.string()),
    }),
  ),
  orphan_user_ids: z.array(z.string()),
  draft_requests_deleted: z.number(),
});

export type CleanupResult = {
  ok: boolean;
  rounds: number;
  /** Sandboxes whose rows were removed: everything of theirs is gone. */
  sandboxesFinished: number;
  /**
   * Sandboxes returned by the database but not finished, because a part
   * failed (or, for Stripe customers, Stripe is not configured). Their rows
   * stay, and the next run returns them again.
   */
  sandboxesPending: number;
  draftRequestsDeleted: number;
  usersDeleted: number;
  storageObjectsRemoved: number;
  stripeCustomersDeleted: number;
  /** Customers left alone because Stripe is not configured. */
  stripeCustomersSkipped: number;
  /** What failed, by id where an id is safe to show (none of these is a secret). */
  failures: {
    /** The database function that lists what to clean up. */
    database: string | null;
    /** The database function that removes the finished rows. */
    finish: string | null;
    users: string[];
    storageBatches: number;
    stripeCustomers: string[];
  };
};

function emptyResult(): CleanupResult {
  return {
    ok: true,
    rounds: 0,
    sandboxesFinished: 0,
    sandboxesPending: 0,
    draftRequestsDeleted: 0,
    usersDeleted: 0,
    storageObjectsRemoved: 0,
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
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

function isMissingCustomer(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "resource_missing"
  );
}

/**
 * Runs `task` for every item, `PARALLEL_DELETES` at a time. A task that
 * throws is turned into a `Failure` for that item, so one broken call never
 * aborts the rest.
 */
async function inChunks<T>(
  items: T[],
  task: (item: T) => PromiseLike<Failure | null>,
): Promise<{ item: T; failure: Failure | null }[]> {
  const results: { item: T; failure: Failure | null }[] = [];
  for (let i = 0; i < items.length; i += PARALLEL_DELETES) {
    const chunk = items.slice(i, i + PARALLEL_DELETES);
    const settled = await Promise.all(
      chunk.map(async (item) => {
        try {
          return { item, failure: await task(item) };
        } catch (error) {
          return { item, failure: { message: describe(error) } };
        }
      }),
    );
    results.push(...settled);
  }
  return results;
}

/** One `delete_expired_demo_sandboxes` batch, cleaned up. */
async function cleanRound({
  admin,
  stripe,
  batch,
  result,
}: {
  admin: CleanupAdminClient;
  stripe: CleanupStripeClient | null;
  batch: z.infer<typeof rpcResultSchema>;
  result: CleanupResult;
}): Promise<{ failed: boolean; pending: number }> {
  // A sandbox is finished only when none of its parts failed.
  const blocked = new Set<string>();
  let failed = false;

  // Users. Each user belongs to one sandbox; strays belong to none.
  const users = [
    ...batch.sandboxes.flatMap((sandbox) =>
      sandbox.user_ids.map((userId) => ({ userId, sandboxId: sandbox.id })),
    ),
    ...batch.orphan_user_ids.map((userId) => ({ userId, sandboxId: null })),
  ];
  const userResults = await inChunks(users, async ({ userId }) => {
    const { error } = await admin.auth.admin.deleteUser(userId);
    // 404: somebody removed the user already, which is the goal.
    return error && error.status !== 404 ? error : null;
  });
  for (const { item, failure } of userResults) {
    if (failure) {
      console.error(
        "cleanup-demo: could not delete user",
        item.userId,
        failure.message,
      );
      result.failures.users.push(item.userId);
      failed = true;
      if (item.sandboxId) blocked.add(item.sandboxId);
    } else {
      result.usersDeleted += 1;
    }
  }

  // Blobs, in batches across sandboxes; a failed batch blocks every sandbox
  // that has a path in it.
  const paths = batch.sandboxes.flatMap((sandbox) =>
    sandbox.storage_paths.map((path) => ({ path, sandboxId: sandbox.id })),
  );
  for (let i = 0; i < paths.length; i += STORAGE_BATCH_SIZE) {
    const chunk = paths.slice(i, i + STORAGE_BATCH_SIZE);
    let failure: Failure | null;
    try {
      const { error } = await admin.storage
        .from(STORAGE_BUCKET)
        .remove(chunk.map((entry) => entry.path));
      failure = error;
    } catch (error) {
      failure = { message: describe(error) };
    }
    if (failure) {
      console.error(
        "cleanup-demo: could not remove a storage batch of",
        chunk.length,
        "objects",
        failure.message,
      );
      result.failures.storageBatches += 1;
      failed = true;
      for (const entry of chunk) blocked.add(entry.sandboxId);
    } else {
      result.storageObjectsRemoved += chunk.length;
    }
  }

  // Stripe test customers. With no Stripe configured they cannot be deleted
  // and are not a failure, but their sandbox is kept so a later run, with
  // Stripe configured, still knows the customer ids.
  const customers = batch.sandboxes.flatMap((sandbox) =>
    sandbox.stripe_customer_ids.map((customerId) => ({
      customerId,
      sandboxId: sandbox.id,
    })),
  );
  if (stripe === null) {
    result.stripeCustomersSkipped += customers.length;
    for (const entry of customers) blocked.add(entry.sandboxId);
  } else {
    const customerResults = await inChunks(
      customers,
      async ({ customerId }) => {
        try {
          await stripe.customers.del(customerId);
          return null;
        } catch (error) {
          if (isMissingCustomer(error)) return null;
          return { message: describe(error) };
        }
      },
    );
    for (const { item, failure } of customerResults) {
      if (failure) {
        console.error(
          "cleanup-demo: could not delete Stripe customer",
          item.customerId,
          failure.message,
        );
        result.failures.stripeCustomers.push(item.customerId);
        failed = true;
        blocked.add(item.sandboxId);
      } else {
        result.stripeCustomersDeleted += 1;
      }
    }
  }

  // Finish the sandboxes whose parts all worked. The others keep their rows
  // and come back on the next run.
  const finishable = batch.sandboxes
    .map((sandbox) => sandbox.id)
    .filter((id) => !blocked.has(id));
  let pending = batch.sandboxes.length - finishable.length;

  if (finishable.length > 0) {
    let finishError: Failure | null;
    try {
      const { error } = await admin.rpc("finish_demo_sandbox_cleanup", {
        p_ids: finishable,
      });
      finishError = error;
    } catch (error) {
      finishError = { message: describe(error) };
    }
    if (finishError) {
      console.error(
        "cleanup-demo: could not finish sandboxes",
        finishError.message,
      );
      result.failures.finish = finishError.message;
      pending += finishable.length;
      failed = true;
    } else {
      result.sandboxesFinished += finishable.length;
    }
  }

  result.sandboxesPending += pending;
  return { failed, pending };
}

/**
 * Deletes expired demo sandboxes in two steps. The database function
 * (`delete_expired_demo_sandboxes`) deletes the workspaces and hands back,
 * per sandbox, the users, blobs and Stripe customers it cannot remove; this
 * removes them, then tells the database which sandboxes are done
 * (`finish_demo_sandbox_cleanup`). A sandbox with any failed part is not
 * finished, so its row stays and the next run tries it again. One failed
 * item never stops the rest, and a call that throws counts as a failure.
 */
export async function cleanupExpiredDemos({
  admin,
  stripe,
}: {
  admin: CleanupAdminClient;
  stripe: CleanupStripeClient | null;
}): Promise<CleanupResult> {
  const result = emptyResult();

  while (result.rounds < MAX_ROUNDS) {
    let data: unknown;
    let error: Failure | null;
    try {
      ({ data, error } = await admin.rpc("delete_expired_demo_sandboxes"));
    } catch (thrown) {
      data = null;
      error = { message: describe(thrown) };
    }
    const parsed = rpcResultSchema.safeParse(data);
    if (error || !parsed.success) {
      const message = error ? error.message : "Unexpected cleanup result";
      console.error("cleanup-demo: database step failed", message);
      result.failures.database = message;
      result.ok = false;
      return result;
    }

    result.rounds += 1;
    result.draftRequestsDeleted += parsed.data.draft_requests_deleted;
    const { failed, pending } = await cleanRound({
      admin,
      stripe,
      batch: parsed.data,
      result,
    });

    if (failed) result.ok = false;
    // Ask again only after a full batch that was cleaned completely: a
    // sandbox left pending would come straight back in the next batch.
    if (failed || pending > 0 || parsed.data.sandboxes.length < BATCH_SIZE) {
      break;
    }
  }

  return result;
}
