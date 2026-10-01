import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { parseDbQueryRows } from "./db-query";

const execFileAsync = promisify(execFile);

// The seeded Pro workspace from supabase/seed.sql (see e2e/ai-draft.spec.ts).
// It is reused across every local and CI run, and two things pile up in it
// if nothing cleans up:
//
// 1. AI draft requests. claim_ai_draft caps the workspace at 50 requests per
//    24 hours, so a handful of reruns can exhaust the limit and fail the
//    spec with a 429 instead of the assertion it was written for. All of the
//    workspace's rows are deleted.
// 2. Clients, projects, members and invitations that specs create through
//    the UI (for example "A11y Client light-..."). seed.sql gives this
//    workspace only its owner, so everything else in it came from a test and
//    is deleted, leaving the seeded owner, the workspace and its billing row.
//    Deleting projects cascades to their updates, comments, files and draft
//    requests. The workspace has no seeded files, so there are no storage
//    objects to remove. Other workspaces and users are not touched.
const AI_DRAFT_WORKSPACE_ID = "20000000-0000-0000-0000-000000000001";
const AI_DRAFT_OWNER_ID = "00000002-0000-0000-0000-000000000021";

// One statement per entry: `supabase db query` runs a single command. Order
// matters: members, invitations and projects reference clients, none of them
// with on delete cascade.
const CLEANUP_STATEMENTS = [
  `delete from public.ai_draft_requests where workspace_id = '${AI_DRAFT_WORKSPACE_ID}'`,
  `delete from public.workspace_members where workspace_id = '${AI_DRAFT_WORKSPACE_ID}' and user_id <> '${AI_DRAFT_OWNER_ID}'`,
  `delete from public.invitations where workspace_id = '${AI_DRAFT_WORKSPACE_ID}'`,
  `delete from public.projects where workspace_id = '${AI_DRAFT_WORKSPACE_ID}'`,
  `delete from public.clients where workspace_id = '${AI_DRAFT_WORKSPACE_ID}'`,
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// What `supabase db query -o json` prints for the sandbox user query below.
// The ids end up inside a SQL statement, so an output of any other shape (a
// changed CLI format, an error object) stops the setup instead of producing
// a statement from whatever was there.
const sandboxUserRowSchema = z.object({
  owner_user_id: z.string().regex(UUID),
  member_user_id: z.string().regex(UUID),
  client_one_user_id: z.string().regex(UUID),
  client_two_user_id: z.string().regex(UUID),
});

async function localQuery(statement: string) {
  return execFileAsync("pnpm", [
    "supabase",
    "db",
    "query",
    "--local",
    "-o",
    "json",
    statement,
  ]);
}

// Sandbox budget. Every "Try as ..." click creates a sandbox with four users,
// and create_demo_sandbox refuses the 41st sandbox in an hour. A full run
// stays well under that, with room for CI's 2 retries, because specs that only
// read a sandbox share one per file (startSharedDemo in e2e/support/demo.ts)
// and only the specs that change it start their own (startDemo). Sandboxes
// per run, by file:
//
//   demo-limits.spec.ts          2  (AI + upload group, then the 5-upload test)
//   demo-sandbox.spec.ts         5  (shared agency, shared client, own
//                                    isolation pair, own client-removed)
//   demo-data.spec.ts            2  (shared agency, shared client)
//   visual-polish.spec.ts        2  (shared agency, shared client)
//   destructive-contrast.spec.ts 1
//   demo-billing.spec.ts         1
//   demo-invites.spec.ts         1
//                               --
//                               14
//
// A new spec that starts a sandbox per test should share one instead, unless
// it changes the sandbox. Keep this table in step with the specs.
//
// Left alone the sandboxes would also pile up in the local database. This
// removes all of them, the way the daily cron does in production: the
// workspaces first (deleting a user first would trip protect_last_owner),
// then the users. The registry rows go last: deleting the workspaces leaves
// them behind (with the user ids), and they must not count toward the caps of
// later runs. The two usage ledgers go with them: the AI one feeds the daily
// AI budget across all sandboxes, so a run would otherwise count against the
// next. The local database is throwaway; a sandbox someone made by hand goes
// too. Storage blobs stay: Storage does not allow deleting objects through
// SQL.
async function deleteDemoSandboxes() {
  const { stdout } = await localQuery(
    "select owner_user_id, member_user_id, client_one_user_id, client_two_user_id from public.demo_sandboxes",
  );
  const rows = parseDbQueryRows(stdout, sandboxUserRowSchema);
  const userIds = rows.flatMap((row) => Object.values(row));

  await localQuery(
    "delete from public.workspaces where id in (select workspace_id from public.demo_sandboxes union select free_workspace_id from public.demo_sandboxes)",
  );
  if (userIds.length > 0) {
    const list = userIds.map((id) => `'${id}'`).join(", ");
    await localQuery(`delete from auth.users where id in (${list})`);
  }
  await localQuery("delete from public.demo_sandboxes");
  await localQuery("delete from public.demo_ai_usage");
  await localQuery("delete from public.demo_upload_usage");
}

/**
 * Runs once before the whole Playwright suite. Uses the Supabase CLI
 * against the local stack, the same one `pnpm supabase start` sets up, so
 * this needs no key (service-role or otherwise) and no extra dependency.
 */
export default async function globalSetup() {
  for (const statement of CLEANUP_STATEMENTS) {
    await execFileAsync("pnpm", [
      "supabase",
      "db",
      "query",
      "--local",
      statement,
    ]);
  }
  await deleteDemoSandboxes();
}
