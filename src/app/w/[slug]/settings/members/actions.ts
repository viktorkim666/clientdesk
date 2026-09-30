"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { isDemoWorkspace } from "@/lib/demo/is-demo-workspace";
import { getEmailDelivery, getEmailSender } from "@/lib/email";
import {
  generateInvitationToken,
  hashInvitationToken,
} from "@/lib/invitations/token";
import { env } from "@/lib/env";
import { inviteSchema } from "@/lib/validation/invitation";
import type { Database } from "@/types/database";

// `inviteUrl` is set only when the email was not delivered by a real provider,
// so the owner can hand the link over themselves.
export type MemberActionResult =
  { ok: true; inviteUrl?: string } | { ok: false; error: string };

const INVITATION_TTL_DAYS = 7;

export async function inviteMember(
  workspaceId: string,
  workspaceSlug: string,
  workspaceName: string,
  formData: FormData,
): Promise<MemberActionResult> {
  const clientIdInput = formData.get("clientId");
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
    clientId:
      typeof clientIdInput === "string" && clientIdInput.length > 0
        ? clientIdInput
        : undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
    };
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims) {
    return { ok: false, error: "You must be signed in" };
  }

  // Checked here as well as in the UI: the button being disabled stops
  // nobody who calls the action directly. Sandbox users have undeliverable
  // addresses, and the demo has no use for real invitations.
  try {
    if (await isDemoWorkspace(supabase, workspaceId)) {
      return {
        ok: false,
        error: "Invites are turned off in the demo workspace.",
      };
    }
  } catch (lookupError) {
    console.error("inviteMember action: demo check failed", lookupError);
    return { ok: false, error: "Could not send the invitation. Try again." };
  }

  const token = generateInvitationToken();
  const { data: invitation, error: insertError } = await supabase
    .from("invitations")
    .insert({
      workspace_id: workspaceId,
      email: parsed.data.email,
      role: parsed.data.role,
      client_id: parsed.data.clientId ?? null,
      token_hash: hashInvitationToken(token),
      invited_by: claims.claims.sub,
      expires_at: new Date(
        Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !invitation) {
    return { ok: false, error: "You are not allowed to send this invitation" };
  }

  const inviteUrl = `${env.NEXT_PUBLIC_SITE_URL}/invite/${token}`;
  const delivery = getEmailDelivery();

  // With no sender at all (production without RESEND_API_KEY) there is
  // nothing to try: the invitation stays and the owner gets the link.
  if (delivery !== "none") {
    try {
      await getEmailSender().sendInvitationEmail({
        to: parsed.data.email,
        workspaceName,
        inviteUrl,
      });
    } catch (sendError) {
      console.error(
        "inviteMember action: sendInvitationEmail failed",
        sendError,
      );
      const { error: deleteError } = await supabase
        .from("invitations")
        .delete()
        .eq("id", invitation.id);
      if (deleteError) {
        console.error(
          "inviteMember action: could not delete the invitation",
          deleteError,
        );
      }
      return {
        ok: false,
        error: "Could not send the invitation email. Try again.",
      };
    }
  }

  revalidatePath(`/w/${workspaceSlug}/settings/members`);
  // The console sender only writes to a local file, so it counts as "not
  // delivered" too: the link is shown whenever no real provider sent it.
  return delivery === "provider" ? { ok: true } : { ok: true, inviteUrl };
}

export async function changeMemberRole(
  workspaceId: string,
  workspaceSlug: string,
  userId: string,
  role: Database["public"]["Enums"]["workspace_role"],
): Promise<MemberActionResult> {
  const supabase = await createClient();
  // `.select()` makes Postgres return the updated rows, not just whether the
  // request itself errored: without it, updating a row that no longer
  // matches (e.g. another owner removed this member first) comes back as
  // `{ error: null }` with zero rows actually changed, and the caller would
  // wrongly treat that as success.
  const { data, error } = await supabase
    .from("workspace_members")
    .update({ role, client_id: null })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .select("user_id");

  if (error || !data || data.length === 0) {
    return { ok: false, error: "Could not change this member's role" };
  }

  revalidatePath(`/w/${workspaceSlug}/settings/members`);
  return { ok: true };
}

export async function removeMember(
  workspaceId: string,
  workspaceSlug: string,
  userId: string,
): Promise<MemberActionResult> {
  const supabase = await createClient();
  // Same reasoning as `changeMemberRole` above: without `.select()`, deleting
  // a row someone else already removed comes back as `{ error: null }` with
  // nothing actually deleted.
  const { data, error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .select("user_id");

  if (error || !data || data.length === 0) {
    return { ok: false, error: "Could not remove this member" };
  }

  revalidatePath(`/w/${workspaceSlug}/settings/members`);
  return { ok: true };
}
