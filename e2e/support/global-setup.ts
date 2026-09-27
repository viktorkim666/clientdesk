import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// The seeded Pro workspace from supabase/seed.sql (see e2e/ai-draft.spec.ts).
// It is reused across every local and CI run, and claim_ai_draft caps it at
// 50 draft requests per 24 hours, so a handful of reruns can exhaust the
// limit and start failing the spec with a 429 instead of the assertion it
// was written for. Clearing this workspace's rows before the suite runs
// keeps that limit from ever being a rerun's problem.
const AI_DRAFT_WORKSPACE_ID = "20000000-0000-0000-0000-000000000001";

/**
 * Runs once before the whole Playwright suite. Uses the Supabase CLI
 * against the local stack, the same one `pnpm supabase start` sets up, so
 * this needs no key (service-role or otherwise) and no extra dependency.
 */
export default async function globalSetup() {
  await execFileAsync("pnpm", [
    "supabase",
    "db",
    "query",
    "--local",
    `delete from public.ai_draft_requests where workspace_id = '${AI_DRAFT_WORKSPACE_ID}';`,
  ]);
}
