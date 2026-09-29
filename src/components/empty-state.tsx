import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

// The title is not a heading: an empty state sits inside pages that already
// have their own h1 and section headings.
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "default",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className={cn(
            "size-10 rounded-xl [&_svg:not([class*='size-'])]:size-5",
            tone === "danger"
              ? "bg-destructive/10 text-destructive"
              : "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
        >
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}
