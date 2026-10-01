export type SandboxBilling =
  { kind: "pro"; freeSlug: string | null } | { kind: "free" };

/**
 * The result of `rpc("get_sandbox_billing", { p_workspace_id })`: a row for
 * each half of a sandbox the caller can see, none for any other workspace.
 */
export interface SandboxBillingResult {
  data: { kind: string; free_slug: string | null }[] | null;
  error: Error | null;
}

/**
 * Which half of a demo sandbox a workspace is, or null outside a sandbox,
 * from the `get_sandbox_billing` function's result. The function is
 * security invoker, so it runs under the caller's own RLS: the sandbox row
 * and the Free sibling's slug are readable by members of the sandbox only.
 * The Pro half carries the sibling's slug for the link on the billing page.
 *
 * An error, or a kind this code does not know, throws instead of answering
 * null, so a failed check never shows the regular billing page inside a
 * sandbox.
 */
export function parseSandboxBilling({
  data,
  error,
}: SandboxBillingResult): SandboxBilling | null {
  if (error) {
    throw error;
  }
  const row = data?.[0];
  if (!row) {
    return null;
  }
  if (row.kind === "free") {
    return { kind: "free" };
  }
  if (row.kind === "pro") {
    return { kind: "pro", freeSlug: row.free_slug };
  }
  throw new Error(`Unknown sandbox billing kind "${row.kind}"`);
}
