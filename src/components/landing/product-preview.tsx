import { cn } from "cn";
import { StatusBadge } from "@/components/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import { PreviewFrame } from "./preview-frame";
import {
  ACTIVITY,
  FLOATING_UPDATE,
  METRICS,
  PREVIEW_URL,
  PROJECTS,
  WORKSPACE_NAME,
} from "./sample-data";

export function ProductPreview() {
  return (
    <PreviewFrame className="relative mx-auto w-full max-w-5xl">
      <div className="overflow-hidden rounded-xl bg-card landing-shadow ring-1 ring-border">
        <div className="flex items-center gap-3 border-b bg-muted/50 px-4 py-3">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
            <span className="size-2.5 rounded-full bg-foreground/15" />
          </div>
          <div className="mx-auto flex h-6 w-full max-w-xs items-center justify-center rounded-md bg-background px-3 text-xs text-foreground/70 ring-1 ring-border">
            <span className="truncate">{PREVIEW_URL}</span>
          </div>
          <div className="w-10 max-sm:hidden" />
        </div>

        <div className="flex flex-col gap-4 p-4 sm:gap-5 sm:p-6 sm:pb-20">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-base font-semibold sm:text-lg">
                {WORKSPACE_NAME}
              </p>
              <p className="text-xs text-foreground/70">Dashboard</p>
            </div>
            <UserAvatar name="Maya Chen" />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
            {METRICS.map((metric, index) => (
              <div
                key={metric.label}
                className={cn(
                  "rounded-lg bg-background p-3 ring-1 ring-border sm:p-4",
                  index === 2 && "max-sm:hidden",
                )}
              >
                <p data-metric-label className="text-xs text-foreground/70">
                  {metric.label}
                </p>
                <p className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                  {metric.value}
                </p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 sm:gap-4 md:grid-cols-5">
            <div className="rounded-lg bg-background ring-1 ring-border md:col-span-3">
              <p className="border-b px-4 py-3 text-sm font-semibold">
                Projects
              </p>
              <ul className="divide-y">
                {PROJECTS.map((project) => (
                  <li
                    key={project.name}
                    className="flex items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {project.name}
                      </p>
                      <p className="truncate text-xs text-foreground/70">
                        {project.client} · {project.updated}
                      </p>
                    </div>
                    <StatusBadge status={project.status} />
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg bg-background ring-1 ring-border max-md:hidden md:col-span-2">
              <p className="border-b px-4 py-3 text-sm font-semibold">
                Recent activity
              </p>
              <ul className="divide-y">
                {ACTIVITY.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start gap-3 px-4 py-3"
                  >
                    <UserAvatar name={item.who} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs leading-snug">
                        <span className="font-medium">{item.who}</span>{" "}
                        {item.what}
                      </p>
                      <p className="mt-0.5 text-xs text-foreground/70">
                        {item.when}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div
        data-floating-update
        className="absolute -right-3 -bottom-28 hidden w-72 rounded-xl bg-card p-4 landing-shadow ring-1 ring-border sm:block xl:-right-14"
      >
        <div className="flex items-center gap-2">
          <UserAvatar name={FLOATING_UPDATE.author} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium">
              {FLOATING_UPDATE.author}
            </p>
            <p className="truncate text-xs text-foreground/70">
              {FLOATING_UPDATE.project} · {FLOATING_UPDATE.when}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-snug">{FLOATING_UPDATE.body}</p>
        <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted p-2.5">
          <UserAvatar name={FLOATING_UPDATE.commenter} size="sm" />
          <p className="text-xs leading-snug">
            <span className="font-medium">{FLOATING_UPDATE.commenter}</span>{" "}
            {FLOATING_UPDATE.comment}
          </p>
        </div>
      </div>
    </PreviewFrame>
  );
}
