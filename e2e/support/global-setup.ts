import { execFile } from "node:child_process";
import { promisify } from "node:util";

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
}
