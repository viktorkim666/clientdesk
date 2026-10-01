"use client";

import Link from "next/link";
import { MenuIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const linkClass =
  "flex min-h-11 items-center rounded-md px-3 text-base text-foreground transition-colors hover:bg-muted";

// The inline section nav and the header's Log in take over at md.
const DESKTOP_QUERY = "(min-width: 768px)";

const SECTIONS = [
  { label: "Features", id: "features", headingId: "features-heading" },
  {
    label: "How it works",
    id: "how-it-works",
    headingId: "how-it-works-heading",
  },
] as const;

// Below md the header has room for the brand, Sign up and this button only.
// The sheet holds the rest. Base UI traps focus while it is open and returns
// it to the trigger on close, except after a section link: then the page
// scrolls to the section and its heading takes focus.
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const pendingSection = useRef<(typeof SECTIONS)[number] | null>(null);
  const close = () => setOpen(false);

  // A sheet left open while the window grows past md would sit over the
  // desktop header with its trigger gone.
  useEffect(() => {
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  // The page behind an open sheet is scroll-locked, so the jump waits until
  // the sheet has closed.
  function handleOpenChangeComplete(isOpen: boolean) {
    const section = pendingSection.current;
    if (isOpen || !section) return;
    window.history.pushState(null, "", `#${section.id}`);
    document.getElementById(section.id)?.scrollIntoView();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // A choice made in an earlier visit must not outlive it.
        if (next) pendingSection.current = null;
        setOpen(next);
      }}
      onOpenChangeComplete={handleOpenChangeComplete}
    >
      <SheetTrigger
        render={
          <Button variant="ghost" size="icon" className="size-11 md:hidden" />
        }
        aria-label="Menu"
      >
        <MenuIcon aria-hidden="true" />
      </SheetTrigger>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="md:hidden"
        finalFocus={() => {
          const section = pendingSection.current;
          return section ? document.getElementById(section.headingId) : true;
        }}
      >
        <div className="flex h-14 items-center justify-between border-b pr-1 pl-4">
          <SheetTitle>Menu</SheetTitle>
          <SheetClose
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label="Close menu"
              />
            }
          >
            <XIcon aria-hidden="true" />
          </SheetClose>
        </div>
        <nav aria-label="Page sections" className="flex flex-col gap-1 px-3">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={linkClass}
              onClick={(event) => {
                event.preventDefault();
                pendingSection.current = section;
                close();
              }}
            >
              {section.label}
            </a>
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3 border-t p-4">
          <Link
            href="/login"
            onClick={close}
            className={buttonVariants({
              variant: "outline",
              className: "h-11 w-full",
            })}
          >
            Log in
          </Link>
          <Link
            href="/signup"
            onClick={close}
            className={buttonVariants({ className: "h-11 w-full" })}
          >
            Sign up
          </Link>
          <div className="flex items-center justify-between pl-1 text-sm text-muted-foreground">
            Theme
            <ThemeToggle />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
