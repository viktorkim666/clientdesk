import type { Metadata } from "next";
import Link from "next/link";
import { OutsideWorkspaceHeader } from "@/components/outside-workspace-header";
import { PageBackdrop } from "@/components/page-backdrop";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="relative isolate flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <PageBackdrop />
      <OutsideWorkspaceHeader />
      <main className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist, or you don&apos;t
          have access to it.
        </p>
        <Link href="/" className={buttonVariants()}>
          Back home
        </Link>
      </main>
    </div>
  );
}
