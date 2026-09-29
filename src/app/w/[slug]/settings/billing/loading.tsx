import { Skeleton } from "@/components/ui/skeleton";

// Shaped like the billing page (header, plan card, test-mode card) so
// nothing jumps when it streams in.
export default function BillingLoading() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Loading billing…</span>
      <div className="space-y-2" aria-hidden="true">
        <Skeleton className="h-8 w-40 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div
        className="max-w-2xl space-y-4 rounded-xl bg-card p-4 ring-1 ring-foreground/10"
        aria-hidden="true"
      >
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-12" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
        <Skeleton className="h-4 w-40 max-w-full" />
        <Skeleton className="h-1 w-full rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-56 max-w-full" />
          <Skeleton className="h-4 w-48 max-w-full" />
          <Skeleton className="h-4 w-52 max-w-full" />
        </div>
        <Skeleton className="h-7 w-32" />
      </div>
      <Skeleton className="h-20 max-w-2xl rounded-xl" aria-hidden="true" />
    </div>
  );
}
