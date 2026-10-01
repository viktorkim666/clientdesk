"use client";

import Link from "next/link";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WorkspaceSwitcher({
  current,
  workspaces,
}: {
  current: string;
  workspaces: { name: string; slug: string }[];
}) {
  const currentWorkspace = workspaces.find(
    (workspace) => workspace.slug === current,
  );

  // Nothing to switch to: show the name, not a control that opens a menu
  // with a single item. The dropdown offers no other action today.
  if (workspaces.length < 2) {
    return (
      <p
        title={currentWorkspace?.name}
        className="truncate px-2.5 py-1 text-sm font-medium"
      >
        <span className="sr-only">Workspace: </span>
        <span>{currentWorkspace?.name ?? "Workspace"}</span>
      </p>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between"
          />
        }
      >
        <span className="truncate">
          {currentWorkspace?.name ?? "Workspace"}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.slug}
            render={<Link href={`/w/${workspace.slug}`} />}
          >
            {workspace.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
