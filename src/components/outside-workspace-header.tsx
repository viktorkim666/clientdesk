import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * Top row shown on pages outside a workspace (sign-in, sign-up, onboarding,
 * invite): the brand mark on the left, the theme toggle on the right.
 */
export function OutsideWorkspaceHeader() {
  return (
    <header className="flex w-full max-w-sm items-center justify-between">
      <BrandMark />
      <ThemeToggle />
    </header>
  );
}
