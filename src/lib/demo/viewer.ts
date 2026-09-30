import type { Database } from "@/types/database";

type WorkspaceRole = Database["public"]["Enums"]["workspace_role"];

export type DemoViewer = {
  label: string;
  /** The label for a phone: name and side only, no "Viewing as". */
  shortLabel: string;
  /** The secondary line under the name in the account menu. */
  accountDetail: string;
  /** Button text for the other view, or `null` when the user has none. */
  switchLabel: string | null;
  /** The switch button's visible text on a phone, after "Switch to". */
  switchShortLabel: string | null;
};

/**
 * The words for the demo banner: who the visitor is signed in as and which
 * view the switch button offers. Only the owner and the first client have a
 * counterpart to switch to.
 */
export function describeDemoViewer({
  role,
  fullName,
  clientName,
}: {
  role: WorkspaceRole;
  fullName: string | null;
  clientName: string | null;
}): DemoViewer {
  const named = fullName !== null && fullName !== "";

  if (role === "client") {
    const detail = clientName ? `client, ${clientName}` : "client";
    return {
      label: named
        ? `Viewing as ${fullName} (${detail})`
        : "Viewing as a client",
      shortLabel: named ? `${fullName}, client` : "Client",
      accountDetail: clientName ? `Client · ${clientName}` : "Client",
      switchLabel: "Switch to agency view",
      switchShortLabel: "Agency view",
    };
  }

  const detail = role === "owner" ? "agency owner" : "agency member";
  const canSwitch = role === "owner";
  return {
    label: named
      ? `Viewing as ${fullName} (${detail})`
      : `Viewing as the ${detail}`,
    shortLabel: named ? `${fullName}, agency` : capitalize(detail),
    accountDetail: role === "owner" ? "Owner" : "Member",
    switchLabel: canSwitch ? "Switch to client view" : null,
    switchShortLabel: canSwitch ? "Client view" : null,
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
