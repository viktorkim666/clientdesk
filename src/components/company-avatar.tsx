import { Building2 } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// A client company, as opposed to a person: a building icon instead of
// initials, on the same tinted circle as UserAvatar.
export function CompanyAvatar({
  size = "default",
  className,
}: {
  size?: "sm" | "default";
  className?: string;
}) {
  return (
    <Avatar size={size} className={className} aria-hidden="true">
      <AvatarFallback className="bg-sidebar-accent text-sidebar-accent-foreground">
        <Building2 className={size === "sm" ? "size-3.5" : "size-4"} />
      </AvatarFallback>
    </Avatar>
  );
}
