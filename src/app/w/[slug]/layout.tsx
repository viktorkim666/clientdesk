import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { SignOutButton } from "./sign-out-button";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase, slug);

  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspaces(name, slug)")
    .eq("user_id", workspace.userId);

  const workspaces = (memberships ?? [])
    .map((membership) => membership.workspaces)
    .filter((candidate): candidate is { name: string; slug: string } =>
      Boolean(candidate),
    );

  const isStaff = workspace.role === "owner" || workspace.role === "member";

  return (
    <div className="min-h-svh">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 p-4">
          <WorkspaceSwitcher current={workspace.slug} workspaces={workspaces} />
          <nav className="flex flex-wrap items-center gap-4 text-sm">
            <Link href={`/w/${workspace.slug}`}>Dashboard</Link>
            {isStaff ? (
              <Link href={`/w/${workspace.slug}/clients`}>Clients</Link>
            ) : null}
            <Link href={`/w/${workspace.slug}/projects`}>Projects</Link>
            {isStaff ? (
              <Link href={`/w/${workspace.slug}/settings/billing`}>
                Billing
              </Link>
            ) : null}
            {workspace.role === "owner" ? (
              <Link href={`/w/${workspace.slug}/settings/members`}>
                Members
              </Link>
            ) : null}
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4">{children}</main>
    </div>
  );
}
