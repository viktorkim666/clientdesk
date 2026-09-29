import { Badge } from "@/components/ui/badge";
import { roleLabel } from "@/lib/format";
import type { WorkspaceRole } from "@/lib/validation/invitation";

export function RoleBadge({ role }: { role: WorkspaceRole }) {
  return <Badge variant="secondary">{roleLabel(role)}</Badge>;
}
