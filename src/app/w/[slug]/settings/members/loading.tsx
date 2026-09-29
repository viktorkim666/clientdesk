import { Skeleton } from "@/components/ui/skeleton";

// Shaped like the members page (header, members table, invitations table)
// so nothing jumps when it streams in.
export default function MembersLoading() {
  return (
    <div role="status" className="space-y-8">
      <span className="sr-only">Loading members…</span>
      <div
        className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
        aria-hidden="true"
      >
        <div className="space-y-2">
          <Skeleton className="h-8 w-40 max-w-full" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-7 w-16" />
      </div>
      <div
        className="divide-y rounded-xl bg-card ring-1 ring-foreground/10"
        aria-hidden="true"
      >
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            data-row=""
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div className="flex items-center gap-2">
              <Skeleton className="size-6 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-40 max-w-full" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
      <div className="space-y-3" aria-hidden="true">
        <Skeleton className="h-6 w-48 max-w-full" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    </div>
  );
}
