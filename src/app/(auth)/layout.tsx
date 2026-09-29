import { OutsideWorkspaceHeader } from "@/components/outside-workspace-header";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-4">
      <OutsideWorkspaceHeader />
      <main className="w-full max-w-sm">{children}</main>
    </div>
  );
}
