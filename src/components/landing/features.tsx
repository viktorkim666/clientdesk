import {
  Check,
  CreditCard,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { cn } from "cn";
import { FREE_CLIENT_LIMIT } from "@/lib/billing/plan";
import {
  BillingPreview,
  DraftPreview,
  FilesPreview,
  RolesPreview,
} from "./feature-previews";

const FEATURES: readonly {
  title: string;
  copy: string;
  bullets: readonly string[];
  icon: ComponentType<{ className?: string }>;
  preview: ReactNode;
}[] = [
  {
    title: "Roles and access",
    copy: "Invite owners, members and clients by email. Clients see only their own projects, enforced by row-level security in Postgres rather than by hiding buttons.",
    bullets: [
      "Owner, member and client roles",
      "Invitations sent by email",
      "Row-level security in Postgres",
    ],
    icon: ShieldCheck,
    preview: <RolesPreview />,
  },
  {
    title: "Files and conversation",
    copy: "Post updates, reply in comments and share files on every project. Everything a client needs sits on one page instead of scattered across inboxes.",
    bullets: [
      "Updates and comments on each project",
      "File sharing next to the conversation",
    ],
    icon: MessagesSquare,
    preview: <FilesPreview />,
  },
  {
    title: "AI update drafts",
    copy: "Claude writes a first draft of a client update from recent project activity. You edit it and post it, so nothing goes out unreviewed.",
    bullets: [
      "Drafted from recent activity",
      "You edit before anything is posted",
    ],
    icon: Sparkles,
    preview: <DraftPreview />,
  },
  {
    title: "Billing",
    copy: `Each workspace has its own Stripe subscription. Free covers up to ${FREE_CLIENT_LIMIT} clients, and Pro adds unlimited clients and AI drafts.`,
    bullets: [
      "One Stripe subscription per workspace",
      "Free to start, Pro when you grow",
    ],
    icon: CreditCard,
    preview: <BillingPreview />,
  },
];

export function Features() {
  return (
    <section id="features" className="py-12 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="reveal max-w-2xl">
          <p className="text-sm font-medium text-primary">What you get</p>
          <h2
            id="features-heading"
            tabIndex={-1}
            className="mt-3 text-3xl font-semibold tracking-tight outline-none sm:text-4xl"
          >
            Everything a client relationship needs
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            One workspace for your team and your clients, with access rules the
            database itself enforces.
          </p>
        </div>

        <div className="mt-12 flex flex-col gap-20 sm:mt-16 lg:gap-28">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                className="reveal grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16"
              >
                <div className={cn(index % 2 === 1 && "lg:order-2")}>
                  <span className="flex size-10 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-accent-foreground">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-5 text-2xl font-semibold tracking-tight">
                    {feature.title}
                  </h3>
                  <p className="mt-3 max-w-2xl text-muted-foreground">
                    {feature.copy}
                  </p>
                  <ul className="mt-6 flex flex-col gap-2.5">
                    {feature.bullets.map((bullet) => (
                      <li
                        key={bullet}
                        className="flex items-center gap-2.5 text-sm"
                      >
                        <Check
                          className="size-4 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={cn(index % 2 === 1 && "lg:order-1")}>
                  <div className="landing-stage relative flex min-h-80 items-center justify-center overflow-hidden rounded-2xl p-6 ring-1 ring-border sm:p-10 lg:min-h-90">
                    <div className="relative w-full max-w-sm">
                      <div
                        aria-hidden="true"
                        className="absolute inset-x-5 top-4 -bottom-3 rounded-xl bg-card/70 ring-1 ring-border"
                      />
                      <div
                        aria-hidden="true"
                        className="absolute inset-x-10 top-8 -bottom-6 rounded-xl bg-card/40 ring-1 ring-border"
                      />
                      {feature.preview}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
