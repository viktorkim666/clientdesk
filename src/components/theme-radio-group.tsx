"use client";

import { useTheme } from "next-themes";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";

// Shared between ThemeToggle (pages outside a workspace) and NavUser's
// Account menu (inside a workspace), so the light/dark/system state lives
// in one place.
export function ThemeRadioGroup() {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenuRadioGroup
      aria-label="Theme"
      value={theme}
      onValueChange={setTheme}
    >
      <DropdownMenuRadioItem value="light" className="max-md:min-h-11">
        Light
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="dark" className="max-md:min-h-11">
        Dark
      </DropdownMenuRadioItem>
      <DropdownMenuRadioItem value="system" className="max-md:min-h-11">
        System
      </DropdownMenuRadioItem>
    </DropdownMenuRadioGroup>
  );
}
