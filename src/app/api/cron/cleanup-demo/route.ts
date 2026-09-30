import { createHash, timingSafeEqual } from "node:crypto";
import { getStripe } from "@/lib/billing/stripe";
import { toDemoAdminClient } from "@/lib/demo/admin";
import { cleanupExpiredDemos } from "@/lib/demo/cleanup";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";

// A GET Route Handler is dynamic unless it opts in to caching, but the cron
// must never be served from a cache, so say so explicitly.
export const dynamic = "force-dynamic";

// A run works through up to 12 batches of 25 sandboxes (see cleanup.ts), each
// a handful of admin API calls. This is the longest a function may run on
// Vercel's Hobby plan; a run cut short loses nothing, because a sandbox is
// only removed once everything of it is gone.
export const maxDuration = 60;

// Hashing both sides first gives timingSafeEqual equal-length inputs, so the
// comparison time does not reveal the length of the secret either.
function bearerMatches(header: string | null, secret: string): boolean {
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();
  const received = createHash("sha256")
    .update(header ?? "")
    .digest();
  return timingSafeEqual(expected, received);
}

/**
 * Called daily by Vercel Cron, which sends `Authorization: Bearer
 * $CRON_SECRET`. Deletes expired demo sandboxes with their users, blobs and
 * Stripe test customers. The call also keeps the free Supabase project awake.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = serverEnv.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "Cron is not configured" }, { status: 503 });
  }

  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return Response.json(
      { error: "Supabase admin client is not configured" },
      { status: 503 },
    );
  }

  const result = await cleanupExpiredDemos({
    admin: toDemoAdminClient(admin),
    stripe: getStripe(),
  });

  // 500 on a partial failure so the cron run shows as failed; the body says
  // what was still done and what was not.
  return Response.json(result, { status: result.ok ? 200 : 500 });
}
