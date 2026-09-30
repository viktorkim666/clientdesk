import { DemoBanner } from "@/components/demo-banner";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { isCurrentWorkspaceDemo } from "@/lib/demo/current-sandbox";
import { toDemoAdminClient } from "@/lib/demo/admin";
import { canSwitchSandboxRole } from "@/lib/demo/switch";
import { describeDemoViewer, type DemoViewer } from "@/lib/demo/viewer";
import { createAdminClient } from "@/lib/supabase/admin";
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

  // Independent reads, so they run together. Own profile row: profiles_select
  // lets a user read their own profile.
  // A member can read the demo_sandboxes row of a sandbox they are in (either
  // of its two workspaces), so a hit here means this is a demo. The client
  // name only feeds the demo banner and is a cheap read by primary key.
  const [membershipsResult, profileResult, isDemo, clientResult] =
    await Promise.all([
      supabase
        .from("workspace_members")
        .select("workspaces(name, slug)")
        .eq("user_id", workspace.userId),
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", workspace.userId)
        .maybeSingle(),
      isCurrentWorkspaceDemo(supabase, workspace.id),
      workspace.clientId
        ? supabase
            .from("clients")
            .select("name")
            .eq("id", workspace.clientId)
            .maybeSingle()
        : null,
    ]);

  // Same as getCurrentWorkspace: a failed read reaches error.tsx instead of
  // rendering a shell with no workspaces or no name.
  if (membershipsResult.error) throw membershipsResult.error;
  if (profileResult.error) throw profileResult.error;
  if (clientResult?.error) throw clientResult.error;

  const workspaces = (membershipsResult.data ?? [])
    .map((membership) => membership.workspaces)
    .filter((candidate): candidate is { name: string; slug: string } =>
      Boolean(candidate),
    );
  const profile = profileResult.data;

  let viewer: DemoViewer | null = null;
  if (isDemo) {
    viewer = describeDemoViewer({
      role: workspace.role,
      fullName: profile?.full_name?.trim() || null,
      clientName: clientResult?.data?.name ?? null,
    });

    // The other view is only offered while it can work: a visitor can remove
    // the owner or the client from the sandbox's members.
    const adminClient = createAdminClient();
    const canSwitch =
      adminClient !== null &&
      (await canSwitchSandboxRole(
        toDemoAdminClient(adminClient),
        workspace.userId,
        new Date(),
      ));
    if (!canSwitch) {
      viewer = { ...viewer, switchLabel: null, switchShortLabel: null };
    }
  }

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
        userFullName={profile?.full_name?.trim() || null}
        demoDetail={viewer?.accountDetail ?? null}
      />
      <SidebarInset id="main-content" tabIndex={-1}>
        {viewer ? (
          <DemoBanner
            label={viewer.label}
            shortLabel={viewer.shortLabel}
            switchLabel={viewer.switchLabel}
            switchShortLabel={viewer.switchShortLabel}
          />
        ) : null}
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
