import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getDraftGenerator } from "@/lib/ai";
import {
  loadProjectActivity,
  toActivitySupabaseClient,
} from "@/lib/ai/activity";
import { buildDraftPrompt } from "@/lib/ai/prompt";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Matches the SQLSTATEs `claim_ai_draft` raises in
// `supabase/migrations/20260927143617_ai_drafts.sql` - stable codes to
// branch on instead of parsing its exception message text (mirrors CD001
// in `src/app/w/[slug]/clients/actions.ts`).
const PLAN_REQUIRED_ERROR_CODE = "CD002";
const RATE_LIMITED_ERROR_CODE = "CD003";

const projectIdSchema = z.uuid();

function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

type RouteContext = { params: Promise<{ projectId: string }> };

export async function POST(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) {
    return jsonError(401, "Authentication required");
  }

  const { projectId: rawProjectId } = await params;
  const parsedProjectId = projectIdSchema.safeParse(rawProjectId);
  if (!parsedProjectId.success) {
    return jsonError(404, "Not found");
  }
  const projectId = parsedProjectId.data;

  // Checked before `claim_ai_draft` so a request nobody can serve never
  // spends a rate-limit slot (the plan's "Rate limit and demo spend"
  // decision). One side effect: a non-staff caller also sees 503 here
  // instead of the 404 they'd get once claiming ran - acceptable, since
  // "AI drafting is not configured" says nothing about this project or
  // this caller's access to it.
  const generator = getDraftGenerator();
  if (!generator) {
    return jsonError(503, "AI drafting is not configured");
  }

  const { error: claimError } = await supabase.rpc("claim_ai_draft", {
    p_project_id: projectId,
  });
  if (claimError) {
    if (claimError.code === PLAN_REQUIRED_ERROR_CODE) {
      return jsonError(402, "AI drafts are part of the Pro plan.");
    }
    if (claimError.code === RATE_LIMITED_ERROR_CODE) {
      return jsonError(429, "Too many AI drafts right now. Try again later.");
    }
    // Anything else - the caller isn't staff, or the project doesn't
    // exist - is refused as 404, the same way the project page itself
    // never confirms whether an id exists to someone who can't read it.
    // Still logged first: unlike CD002/CD003, this branch also catches a
    // genuinely unexpected failure from the RPC (a Postgres error with no
    // recognized code), which would otherwise vanish behind the same 404
    // as an ordinary access refusal.
    console.error("draft-update route: claim_ai_draft failed", claimError);
    return jsonError(404, "Not found");
  }

  let activity;
  try {
    activity = await loadProjectActivity(
      toActivitySupabaseClient(supabase),
      projectId,
      new Date(Date.now() - SEVEN_DAYS_MS),
    );
  } catch (error) {
    console.error("draft-update route: loadProjectActivity failed", error);
    return jsonError(500, "Could not draft the update");
  }

  // The claim above already spent one of this caller's rate-limit slots,
  // even though this 422 means no Anthropic call ever happens - on
  // purpose, since claiming runs before any work starts, so probing for
  // activity can't be repeated for free.
  if (activity.items.length === 0) {
    return jsonError(
      422,
      "Nothing happened on this project in the last 7 days.",
    );
  }

  const prompt = buildDraftPrompt(activity);
  const encoder = new TextEncoder();
  const iterator = generator
    .generate(prompt, request.signal)
    [Symbol.asyncIterator]();

  // Primed before the Response is constructed: a failure here (e.g. no
  // Anthropic credit) still happens before any bytes go out, so it can be
  // reported as a normal JSON error response instead of an error state on
  // an already-started stream.
  let firstResult: IteratorResult<string>;
  try {
    firstResult = await iterator.next();
  } catch (error) {
    console.error(
      "draft-update route: draft generation failed before the first chunk",
      error,
    );
    return jsonError(
      502,
      "The AI service is unavailable right now. Try again later.",
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let result = firstResult;
        while (!result.done) {
          controller.enqueue(encoder.encode(result.value));
          result = await iterator.next();
        }
        controller.close();
      } catch (error) {
        // The first bytes (headers) are already sent by this point, so
        // the only way left to report a failure is to end the stream in
        // an error state rather than return a JSON error response.
        console.error(
          "draft-update route: draft generation failed mid-stream",
          error,
        );
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
