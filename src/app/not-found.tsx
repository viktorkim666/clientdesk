import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
      <h1 className="text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-sm text-muted-foreground">
        The page you&apos;re looking for doesn&apos;t exist, or you don&apos;t
        have access to it.
      </p>
      <Link href="/" className={buttonVariants()}>
        Back home
      </Link>
    </div>
  );
}
