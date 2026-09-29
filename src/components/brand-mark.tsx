import { PanelsTopLeft } from "lucide-react";
import Link from "next/link";

export function BrandMark({
  href = "/",
  label = "Clientdesk home",
}: {
  href?: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="flex min-h-7 items-center gap-2 text-sm font-semibold"
    >
      <span
        className="flex size-7 items-center justify-center rounded-md bg-primary"
        aria-hidden="true"
      >
        <PanelsTopLeft className="size-4 text-primary-foreground" />
      </span>
      Clientdesk
    </Link>
  );
}
