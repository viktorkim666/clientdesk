import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

// Shaped like the dashboard so nothing jumps when it streams in. Routes
// without their own loading.tsx fall back to this one.
export default function WorkspaceLoading() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Loading workspace…</span>
      <div className="space-y-2" aria-hidden="true">
        <Skeleton className="h-8 w-56 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <Card key={index} size="sm">
            <CardHeader>
              <Skeleton className="h-4 w-28" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5" aria-hidden="true">
        <div className="min-w-0 space-y-3 lg:col-span-3">
          <Skeleton className="h-6 w-24" />
          <div className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
            {[0, 1, 2, 3, 4].map((index) => (
              <div
                key={index}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0 space-y-3 lg:col-span-2">
          <Skeleton className="h-6 w-36" />
          <div className="space-y-4">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="flex items-start gap-3">
                <Skeleton className="size-6 shrink-0 rounded-full" />
                <div className="w-full space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
