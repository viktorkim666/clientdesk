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

export function NavUser({
  email,
  fullName,
  demoDetail,
}: {
  email: string;
  fullName: string | null;
  /** Set inside a demo sandbox: shown where the email would be, because a
      sandbox user's email is a random address nobody should read. */
  demoDetail: string | null;
}) {
  const secondary = demoDetail ?? email;
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
            render={<SidebarMenuButton size="lg" className="max-md:h-12" />}
          >
            <UserAvatar name={fullName} email={email} />
            <span className="grid min-w-0 flex-1 text-left leading-tight">
              {/* The visible text is the name; this prefix keeps "Account" in
                  the accessible name without replacing it (WCAG 2.5.3). */}
              <span className="sr-only">Account: </span>
              <span className="truncate text-sm font-medium">
                {fullName ?? secondary}
              </span>
              {fullName ? (
                <span className="truncate text-xs text-foreground/70">
                  {secondary}
                </span>
              ) : null}
            </span>
            <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top">
            <DropdownMenuGroup>
              <DropdownMenuLabel
                className="[overflow-wrap:anywhere]"
                title={secondary}
              >
                {secondary}
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
              className="w-full max-md:min-h-11"
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
