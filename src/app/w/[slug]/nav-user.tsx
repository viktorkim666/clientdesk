"use client";

import { useActionState, useId } from "react";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { signOut, type AuthActionState } from "@/app/(auth)/actions";
import { ThemeRadioGroup } from "@/components/theme-radio-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { UserAvatar } from "@/components/user-avatar";

const initialState: AuthActionState = { ok: true };

export function NavUser({ email }: { email: string }) {
  const [state, formAction, isPending] = useActionState(signOut, initialState);
  const signOutFormId = useId();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {/* Real form submission for progressive enhancement: the Sign out
            menu item below submits this form via the `form` attribute even
            though it renders outside it (inside the menu's portal). */}
        <form id={signOutFormId} action={formAction} className="hidden" />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                aria-label="Account"
                className="max-md:h-12"
              />
            }
          >
            <UserAvatar email={email} />
            <span className="truncate text-sm">{email}</span>
            <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="truncate" title={email}>
                {email}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {/* Not a DropdownMenuGroup/DropdownMenuLabel pair: that would
                nest a group named "Theme" around ThemeRadioGroup's own
                "Theme"-labelled group, so screen readers would announce
                "Theme" twice. This span is a decorative heading only; the
                accessible name comes from ThemeRadioGroup's aria-label. */}
            <span
              aria-hidden="true"
              className="px-1.5 py-1 text-xs font-medium text-muted-foreground"
            >
              Theme
            </span>
            <ThemeRadioGroup />
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              className="max-md:min-h-11"
              closeOnClick={false}
              nativeButton
              disabled={isPending}
              render={<button type="submit" form={signOutFormId} />}
            >
              <LogOut />
              {isPending ? "Signing out..." : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {!state.ok ? (
          <p role="alert" className="mt-1 text-xs text-destructive">
            {state.error}
          </p>
        ) : null}
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
