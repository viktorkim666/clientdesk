import { BrandMark } from "@/components/brand-mark";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <BrandMark />
          <p className="max-w-md text-sm text-muted-foreground">
            A client portal for small agencies and freelancers.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm text-muted-foreground md:items-end">
          <a
            href="https://github.com/viktorkim666/clientdesk"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-7 items-center rounded-sm transition-colors duration-200 hover:text-foreground"
          >
            Source on GitHub
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
          <p>{`© ${new Date().getFullYear()} Clientdesk`}</p>
        </div>
      </div>
    </footer>
  );
}
