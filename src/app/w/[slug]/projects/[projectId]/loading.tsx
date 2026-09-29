import { Skeleton } from "@/components/ui/skeleton";

// Shaped like the project page (header, updates card, files card) so nothing
// jumps when it streams in.
export default function ProjectLoading() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Loading project…</span>
      <div
        data-header=""
        className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
        aria-hidden="true"
      >
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-64 max-w-full" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
        <Skeleton className="h-8 w-32" />
      </div>
      {[0, 1].map((index) => (
        <div
          key={index}
          data-card=""
          className="space-y-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
          aria-hidden="true"
        >
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}
