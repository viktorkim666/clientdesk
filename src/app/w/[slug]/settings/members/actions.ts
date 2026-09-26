"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getEmailSender } from "@/lib/email";
import {
  generateInvitationToken,
  hashInvitationToken,
} from "@/lib/invitations/token";
import { env } from "@/lib/env";
import { inviteSchema } from "@/lib/validation/invitation";
import type { Database } from "@/types/database";

export type MemberActionResult = { ok: true } | { ok: false; error: string };

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

  try {
    await getEmailSender().sendInvitationEmail({
      to: parsed.data.email,
      workspaceName,
      inviteUrl: `${env.NEXT_PUBLIC_SITE_URL}/invite/${token}`,
    });
  } catch (sendError) {
    console.error("inviteMember action: sendInvitationEmail failed", sendError);
    await supabase.from("invitations").delete().eq("id", invitation.id);
    return {
      ok: false,
      error: "Could not send the invitation email. Try again.",
    };
  }

  revalidatePath(`/w/${workspaceSlug}/settings/members`);
  return { ok: true };
}

export async function changeMemberRole(
  workspaceId: string,
  workspaceSlug: string,
  userId: string,
  role: Database["public"]["Enums"]["workspace_role"],
): Promise<MemberActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("workspace_members")
    .update({ role, client_id: null })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  if (error) {
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
  const { error } = await supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  if (error) {
    return { ok: false, error: "Could not remove this member" };
  }

  revalidatePath(`/w/${workspaceSlug}/settings/members`);
  return { ok: true };
}
