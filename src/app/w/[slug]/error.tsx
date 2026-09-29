"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Workspace route error", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <EmptyState
          icon={TriangleAlert}
          tone="danger"
          title="Something went wrong"
          description="This page couldn't load. Try again, or come back later."
          action={
            <Button type="button" onClick={reset}>
              Try again
            </Button>
          }
        />
      </div>
    </div>
  );
}
