import { OutsideWorkspaceHeader } from "@/components/outside-workspace-header";
import { PageBackdrop } from "@/components/page-backdrop";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative isolate flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <PageBackdrop />
      <OutsideWorkspaceHeader />
      <main className="w-full max-w-sm">{children}</main>
    </div>
  );
}
