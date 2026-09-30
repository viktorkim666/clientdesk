import Link from "next/link";
import { LogoMark } from "./logo-mark";

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
      className="flex min-h-7 items-center gap-2 text-sm font-semibold max-sm:min-h-11"
    >
      <LogoMark className="size-7" />
      Clientdesk
    </Link>
  );
}
