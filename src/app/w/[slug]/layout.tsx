import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { AppSidebar } from "./app-sidebar";

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

  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-foreground focus:ring-2 focus:ring-ring"
      >
        Skip to main content
      </a>
      <AppSidebar
        slug={workspace.slug}
        role={workspace.role}
        workspaces={workspaces}
        userEmail={workspace.userEmail}
      />
      <SidebarInset id="main-content" tabIndex={-1}>
        <header className="flex items-center gap-2 border-b p-4 md:hidden">
          <SidebarTrigger aria-label="Open navigation" className="size-11" />
          <span className="font-medium">{workspace.name}</span>
        </header>
        <div
          data-slot="page-container"
          className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8"
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
