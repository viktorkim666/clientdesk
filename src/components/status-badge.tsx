import { CircleCheck, CircleDot, CirclePause } from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { statusLabel } from "@/lib/format";
import type { ProjectStatus } from "@/lib/validation/project";

const STATUS_STYLES: Record<
  ProjectStatus,
  { icon: ComponentType<{ "aria-hidden": "true" }>; tone: string }
> = {
  active: { icon: CircleDot, tone: "bg-success text-success-foreground" },
  on_hold: { icon: CirclePause, tone: "bg-warning text-warning-foreground" },
  done: { icon: CircleCheck, tone: "bg-muted text-secondary-foreground" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  const { icon: Icon, tone } = STATUS_STYLES[status];

  return (
    <Badge variant="secondary" className={cn(tone, className)}>
      <Icon aria-hidden="true" />
      {statusLabel(status)}
    </Badge>
  );
}
