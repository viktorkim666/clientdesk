"use client";

import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeRadioGroup } from "@/components/theme-radio-group";

export function ThemeToggle() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Theme"
            className="relative size-11 md:size-8"
          />
        }
      >
        <SunIcon className="scale-100 rotate-0 dark:scale-0 dark:-rotate-90" />
        <MoonIcon className="absolute scale-0 rotate-90 dark:scale-100 dark:rotate-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ThemeRadioGroup />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
