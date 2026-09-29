"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CreditCard,
  FolderKanban,
  LayoutDashboard,
  UserCog,
  Users,
} from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { Database } from "@/types/database";
import { NavUser } from "./nav-user";
import { WorkspaceSwitcher } from "./workspace-switcher";

type WorkspaceRole = Database["public"]["Enums"]["workspace_role"];

type NavLink = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
};

export function AppSidebar({
  slug,
  role,
  workspaces,
  userEmail,
}: {
  slug: string;
  role: WorkspaceRole;
  workspaces: { name: string; slug: string }[];
  userEmail: string;
}) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const isStaff = role === "owner" || role === "member";

  const links: NavLink[] = [
    {
      href: `/w/${slug}`,
      label: "Dashboard",
      icon: LayoutDashboard,
      exact: true,
    },
    ...(isStaff
      ? [{ href: `/w/${slug}/clients`, label: "Clients", icon: Users }]
      : []),
    { href: `/w/${slug}/projects`, label: "Projects", icon: FolderKanban },
    ...(isStaff
      ? [
          {
            href: `/w/${slug}/settings/billing`,
            label: "Billing",
            icon: CreditCard,
          },
        ]
      : []),
    ...(role === "owner"
      ? [
          {
            href: `/w/${slug}/settings/members`,
            label: "Members",
            icon: UserCog,
          },
        ]
      : []),
  ];

  return (
    <Sidebar>
      <SidebarHeader>
        <BrandMark href={`/w/${slug}`} label="Workspace home" />
        <WorkspaceSwitcher current={slug} workspaces={workspaces} />
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Primary">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {links.map((link) => {
                  const isActive = link.exact
                    ? pathname === link.href
                    : pathname === link.href ||
                      pathname.startsWith(`${link.href}/`);

                  return (
                    <SidebarMenuItem key={link.href}>
                      <SidebarMenuButton
                        isActive={isActive}
                        className="max-md:h-11"
                        render={
                          <Link
                            href={link.href}
                            aria-current={isActive ? "page" : undefined}
                            onClick={() => setOpenMobile(false)}
                          />
                        }
                      >
                        <link.icon />
                        <span>{link.label}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <NavUser email={userEmail} />
      </SidebarFooter>
    </Sidebar>
  );
}
