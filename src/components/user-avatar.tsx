import { cn } from "cn";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// Initials from a display name ("Ada Lovelace" -> "AL", "madonna" -> "MA") or,
// without one, from the local part of an email
// ("ai-draft-owner@clientdesk.test" -> "AI").
export function getInitials({
  name,
  email,
}: {
  name?: string | null;
  email?: string | null;
}): string {
  // Code points, not UTF-16 units, so an emoji or other astral character is
  // never cut in half.
  const take = (text: string, count: number): string =>
    Array.from(text).slice(0, count).join("");

  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  const last = words[words.length - 1];

  if (first && last) {
    return (
      words.length > 1 ? take(first, 1) + take(last, 1) : take(first, 2)
    ).toUpperCase();
  }

  const local = (email ?? "").split("@")[0] ?? "";
  const letters = local.replace(/[^a-zA-Z]/g, "");
  return take(letters || local, 2).toUpperCase() || "?";
}

export function UserAvatar({
  name,
  email,
  size = "default",
  className,
}: {
  name?: string | null;
  email?: string | null;
  size?: "sm" | "default";
  className?: string;
}) {
  return (
    <Avatar size={size} className={className} aria-hidden="true">
      <AvatarFallback
        className={cn(
          "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
          size === "default" && "text-xs",
        )}
      >
        {getInitials({ name, email })}
      </AvatarFallback>
    </Avatar>
  );
}
