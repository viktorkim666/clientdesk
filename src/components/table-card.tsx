import type { ReactNode } from "react";

// Frames a `Table` like the dashboard's bordered lists: rounded border, a
// muted header row and one cell padding for every list table.
// Cell padding is set here through descendant selectors, not on each cell.
export function TableCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card [&_td]:px-2 [&_td]:py-3 sm:[&_td]:px-4 [&_th]:px-2 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground sm:[&_th]:px-4 [&_thead]:bg-muted/50">
      {children}
    </div>
  );
}
