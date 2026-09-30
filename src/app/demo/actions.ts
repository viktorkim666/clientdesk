"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { toDemoAdminClient } from "@/lib/demo/admin";
import { createSandbox, DemoError } from "@/lib/demo/sandbox";
import { signInAsDemoUser } from "@/lib/demo/sign-in";
import { switchSandboxRole } from "@/lib/demo/switch";
import { hashVisitor, resolveVisitorSalt } from "@/lib/demo/visitor";
import { serverEnv } from "@/lib/env.server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type DemoActionState = { ok: true } | { ok: false; error: string };

const roleSchema = z.enum(["agency", "client"]);

const UNAVAILABLE = "The live demo isn't available here";
const COULD_NOT_START = "The demo couldn't start. Try again in a minute.";
const BUSY = "The demo is busy right now. Try again in a few minutes.";
const VISITOR_LIMIT =
  "You've started a few demos already. Try again in an hour.";

/**
 * Starts a private sandbox and signs the visitor in as its agency owner or
 * as the first client. A client lands on the workspace home, which for a
 * client is a dashboard of only their own projects and updates, one click
 * from any of them.
 */
export async function startDemo(
  _prevState: DemoActionState,
  formData: FormData,
): Promise<DemoActionState> {
  const role = roleSchema.safeParse(formData.get("role"));
  if (!role.success) {
    return { ok: false, error: "Choose agency or client" };
  }

  const adminClient = createAdminClient();
  const salt = resolveVisitorSalt({
    salt: serverEnv.DEMO_VISITOR_SALT,
    isProduction: process.env.NODE_ENV === "production",
  });
  if (!adminClient || !salt) {
    return { ok: false, error: UNAVAILABLE };
  }
  const admin = toDemoAdminClient(adminClient);

  const visitorHash = hashVisitor(await headers(), salt);

  let path: string;
  try {
    const sandbox = await createSandbox(admin, visitorHash);
    try {
      const server = await createClient();
      await signInAsDemoUser(
        admin,
        server,
        role.data === "agency" ? sandbox.ownerEmail : sandbox.clientEmail,
      );
    } catch (signInError) {
      // Nobody will ever open this sandbox, so do not leave it for the
      // cron to find in a day.
      await sandbox.discard();
      throw signInError;
    }
    path = `/w/${sandbox.workspaceSlug}`;
  } catch (error) {
    if (error instanceof DemoError && error.code === "capacity") {
      return { ok: false, error: BUSY };
    }
    if (error instanceof DemoError && error.code === "visitor_limit") {
      return { ok: false, error: VISITOR_LIMIT };
    }
    console.error(
      "Starting the demo failed",
      error instanceof Error ? error.message : error,
    );
    return { ok: false, error: COULD_NOT_START };
  }

  redirect(path);
}

/**
 * Signs the signed-in sandbox user in as the other role (owner and the
 * first client) and reloads the workspace as them.
 */
export async function switchDemoRole(): Promise<DemoActionState> {
  const adminClient = createAdminClient();
  if (!adminClient) {
    return { ok: false, error: UNAVAILABLE };
  }

  const server = await createClient();
  const { data: claims } = await server.auth.getClaims();
  if (!claims) {
    return { ok: false, error: "Sign in to the demo first." };
  }

  const result = await switchSandboxRole(
    toDemoAdminClient(adminClient),
    server,
    claims.claims.sub,
    new Date(),
  );
  if (!result.ok) return result;

  redirect(result.path);
}
