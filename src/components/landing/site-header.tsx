import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { MobileMenu } from "@/components/landing/mobile-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";

const anchorClass =
  "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
        <BrandMark />
        <nav
          aria-label="Page sections"
          className="ml-6 hidden items-center gap-1 md:flex"
        >
          <a href="#features" className={anchorClass}>
            Features
          </a>
          <a href="#how-it-works" className={anchorClass}>
            How it works
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <div className="max-md:hidden">
            <ThemeToggle />
          </div>
          {/* Below md, Log in and the theme toggle live in the mobile menu,
              next to the section links that are hidden here too. */}
          <Link
            href="/login"
            className={buttonVariants({
              variant: "ghost",
              className: "max-md:hidden",
            })}
          >
            Log in
          </Link>
          <Link href="/signup" className={buttonVariants()}>
            Sign up
          </Link>
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
