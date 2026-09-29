import type { ReactNode } from "react";
import { cn } from "cn";

// Decorative previews add no content for assistive tech and no tab stops.
export function PreviewFrame({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div aria-hidden="true" inert className={cn("select-none", className)}>
      {children}
    </div>
  );
}
