import { FileArchive, FileImage, FileText, Lock, Sparkles } from "lucide-react";
import type { ComponentType } from "react";
import { RoleBadge } from "@/components/role-badge";
import { UserAvatar } from "@/components/user-avatar";
import { FREE_CLIENT_LIMIT } from "@/lib/billing/plan";
import { PreviewFrame } from "./preview-frame";
import { DRAFT, FILES, FLOATING_UPDATE, MEMBERS } from "./sample-data";

const panel =
  "landing-shadow relative rounded-xl bg-card p-4 ring-1 ring-border sm:p-5";

export function RolesPreview() {
  return (
    <PreviewFrame className={panel}>
      <p className="text-sm font-semibold">Members</p>
      <ul className="mt-3 divide-y">
        {MEMBERS.map((member) => (
          <li
            key={member.name}
            className="flex items-center gap-3 py-3 first:pt-0"
          >
            <UserAvatar name={member.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{member.name}</p>
              <p className="truncate text-xs text-foreground/70">
                {member.detail}
              </p>
            </div>
            <RoleBadge role={member.role} />
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-start gap-2.5 rounded-lg bg-sidebar-accent p-3 text-sidebar-accent-foreground">
        <Lock className="mt-0.5 size-4 shrink-0" />
        <p className="text-xs leading-snug">
          Clients see only their own projects. Postgres row-level security
          enforces it.
        </p>
      </div>
    </PreviewFrame>
  );
}

const FILE_ICONS: Record<
  (typeof FILES)[number]["kind"],
  ComponentType<{ className?: string }>
> = {
  pdf: FileText,
  image: FileImage,
  archive: FileArchive,
};

export function FilesPreview() {
  return (
    <PreviewFrame className={panel}>
      <p className="text-sm font-semibold">Files</p>
      <ul className="mt-3 flex flex-col gap-2">
        {FILES.map((file) => {
          const Icon = FILE_ICONS[file.kind];
          return (
            <li
              key={file.name}
              className="flex items-center gap-3 rounded-lg bg-background p-2.5 ring-1 ring-border"
            >
              <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-accent text-sidebar-accent-foreground">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">
                {file.name}
              </span>
              <span className="text-xs text-foreground/70">{file.size}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-5 text-sm font-semibold">Comments</p>
      <div className="mt-3 flex flex-col gap-3">
        <div className="flex items-start gap-2.5">
          <UserAvatar name={FLOATING_UPDATE.commenter} size="sm" />
          <p className="rounded-lg bg-background p-2.5 text-xs leading-snug ring-1 ring-border">
            {FLOATING_UPDATE.comment}
          </p>
        </div>
        <div className="flex items-start gap-2.5 sm:pl-8">
          <UserAvatar name={FLOATING_UPDATE.author} size="sm" />
          <p className="rounded-lg bg-background p-2.5 text-xs leading-snug ring-1 ring-border">
            {FLOATING_UPDATE.reply}
          </p>
        </div>
      </div>
    </PreviewFrame>
  );
}

export function DraftPreview() {
  return (
    <PreviewFrame className={panel}>
      <div className="flex items-center gap-2 text-primary">
        <Sparkles className="size-4" />
        <p className="text-sm font-medium">AI draft</p>
      </div>
      <p className="mt-1 text-xs text-foreground/70">{DRAFT.project}</p>
      <div className="mt-4 rounded-lg bg-background p-4 ring-1 ring-border">
        <p className="text-sm leading-snug">{DRAFT.opening}</p>
        <div className="mt-3 flex flex-col gap-2">
          <div className="h-2 w-full rounded-full bg-muted" />
          <div className="h-2 w-11/12 rounded-full bg-muted" />
          <div className="h-2 w-2/3 rounded-full bg-muted" />
        </div>
      </div>
      <p className="mt-4 text-xs text-foreground/70">
        Claude drafts, you edit and post.
      </p>
    </PreviewFrame>
  );
}

export function BillingPreview() {
  return (
    <PreviewFrame className={panel}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-background p-4 ring-1 ring-border">
          <p className="text-sm font-semibold">Free</p>
          <p className="mt-2 text-sm">{`Up to ${FREE_CLIENT_LIMIT} clients`}</p>
        </div>
        <div className="rounded-lg bg-background p-4 ring-2 ring-primary">
          <p className="text-sm font-semibold text-primary">Pro</p>
          <p className="mt-2 text-sm">Unlimited clients</p>
          <p className="mt-1 text-sm">AI update drafts</p>
        </div>
      </div>
      <p className="mt-4 text-xs text-foreground/70">
        Subscriptions are handled by Stripe, one per workspace.
      </p>
    </PreviewFrame>
  );
}
