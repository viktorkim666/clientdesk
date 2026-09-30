import Link from "next/link";
import {
  Activity,
  ArrowRight,
  FolderKanban,
  MessageSquare,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserAvatar } from "@/components/user-avatar";
import {
  buildActivityFeed,
  FEED_LIMIT,
  type ActivityItem,
} from "@/lib/activity";
import { formatDate, formatRelative } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace/current";

const PROJECT_LIMIT = 5;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FEED_SELECT_PROJECT = "projects(name)";

export default async function WorkspaceDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase, slug);

  const isStaff = workspace.role === "owner" || workspace.role === "member";
  const now = new Date();
  const weekAgo = new Date(now.getTime() - WEEK_MS).toISOString();

  // RLS limits every read below to what the caller may see, so a client's
  // dashboard only ever holds their own projects and their activity. The
  // metrics are head-only counts and the list is the five newest rows, so
  // no read grows with the number of projects.
  const projectsTotalQuery = supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspace.id);

  const projectsActiveQuery = supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspace.id)
    .eq("status", "active");

  const projectsQuery = supabase
    .from("projects")
    .select("id, name, status, created_at, clients(name)")
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(PROJECT_LIMIT);

  const clientsCountQuery = isStaff
    ? supabase
        .from("clients")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspace.id)
    : null;

  const weekCountQuery = supabase
    .from("project_updates")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspace.id)
    .gte("created_at", weekAgo);

  // The embedded project name is RLS-scoped like the rows themselves, so a
  // client only ever resolves names of projects they can read.
  const updatesQuery = supabase
    .from("project_updates")
    .select(`id, project_id, author_id, created_at, ${FEED_SELECT_PROJECT}`)
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(FEED_LIMIT);

  const commentsQuery = supabase
    .from("update_comments")
    .select(`id, project_id, author_id, created_at, ${FEED_SELECT_PROJECT}`)
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(FEED_LIMIT);

  const filesQuery = supabase
    .from("project_files")
    .select(
      `id, project_id, uploaded_by, name, created_at, ${FEED_SELECT_PROJECT}`,
    )
    .eq("workspace_id", workspace.id)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(FEED_LIMIT);

  // Author columns point at auth.users, so names come from the same
  // workspace_members -> profiles join the project page uses. Staff rows
  // (and a client's own) are visible to a client through RLS.
  const membersQuery = supabase
    .from("workspace_members")
    .select("user_id, profiles(full_name)")
    .eq("workspace_id", workspace.id);

  const [
    projectsTotalResult,
    projectsActiveResult,
    projectsResult,
    clientsCountResult,
    weekCountResult,
    updatesResult,
    commentsResult,
    filesResult,
    membersResult,
  ] = await Promise.all([
    projectsTotalQuery,
    projectsActiveQuery,
    projectsQuery,
    clientsCountQuery,
    weekCountQuery,
    updatesQuery,
    commentsQuery,
    filesQuery,
    membersQuery,
  ]);

  // A failed read must reach error.tsx, not render as an empty workspace.
  for (const result of [
    projectsTotalResult,
    projectsActiveResult,
    projectsResult,
    clientsCountResult,
    weekCountResult,
    updatesResult,
    commentsResult,
    filesResult,
    membersResult,
  ]) {
    if (result?.error) throw result.error;
  }

  const projects = projectsResult.data ?? [];
  const totalCount = projectsTotalResult.count ?? 0;
  const activeCount = projectsActiveResult.count ?? 0;

  const authorNames = new Map(
    (membersResult.data ?? []).map((member) => [
      member.user_id,
      member.profiles?.full_name ?? "Unnamed",
    ]),
  );

  const feed = buildActivityFeed({
    updates: updatesResult.data ?? [],
    comments: commentsResult.data ?? [],
    files: filesResult.data ?? [],
    authorNames,
    limit: FEED_LIMIT,
  });

  const projectsHref = `/w/${workspace.slug}/projects`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={
          isStaff
            ? "Projects, updates and files across your workspace."
            : "Your projects, updates and files."
        }
      />

      <div
        className={
          isStaff
            ? "grid grid-cols-3 gap-2 sm:gap-4"
            : "grid grid-cols-2 gap-2 sm:gap-4"
        }
      >
        <Metric
          icon={FolderKanban}
          label={
            <>
              Active<span className="max-sm:sr-only"> projects</span>
            </>
          }
        >
          {activeCount}
          {totalCount > 0 ? (
            <span className="text-sm font-normal text-muted-foreground">
              {` of ${totalCount}`}
            </span>
          ) : null}
        </Metric>
        {isStaff ? (
          <Metric icon={Users} label="Clients">
            {clientsCountResult?.count ?? 0}
          </Metric>
        ) : null}
        <Metric
          icon={MessageSquare}
          label={
            <>
              Updates<span className="max-sm:sr-only"> this week</span>
            </>
          }
        >
          {weekCountResult.count ?? 0}
        </Metric>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section
          aria-labelledby="projects-heading"
          className="flex min-w-0 flex-col gap-3 lg:col-span-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 id="projects-heading" className="text-lg font-semibold">
              Projects
            </h2>
            {totalCount > 0 ? (
              <Link
                href={projectsHref}
                className={buttonVariants({ variant: "ghost", size: "sm" })}
              >
                See every project
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </Link>
            ) : null}
          </div>
          {projects.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="Start your first project"
              description={
                isStaff
                  ? "Projects hold the updates and files you share with a client."
                  : "Projects shared with you will appear here."
              }
              action={
                isStaff ? (
                  <Link
                    href={projectsHref}
                    className={buttonVariants({ variant: "outline" })}
                  >
                    Go to project list
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <ul className="divide-y rounded-xl bg-card ring-1 ring-foreground/10">
              {projects.map((project) => (
                <li key={project.id}>
                  <Link
                    href={`/w/${workspace.slug}/projects/${project.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:-outline-offset-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {project.name}
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">
                        {project.clients?.name ?? "—"}
                      </span>
                    </span>
                    <StatusBadge status={project.status} className="shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section
          aria-labelledby="recent-activity-heading"
          className="flex min-w-0 flex-col gap-3 lg:col-span-2"
        >
          <h2 id="recent-activity-heading" className="text-lg font-semibold">
            Recent activity
          </h2>
          {feed.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No activity yet"
              description="Updates, comments and files will show up here."
            />
          ) : (
            <ol className="space-y-4">
              {feed.map((item) => (
                <ActivityRow
                  key={item.id}
                  item={item}
                  slug={workspace.slug}
                  now={now}
                />
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  // A long label hides its tail below sm with `max-sm:sr-only`, so three
  // cards read as one line each while the full text stays one text run for
  // screen readers.
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card size="sm" className="gap-1 sm:gap-(--card-spacing)">
      <CardHeader className="px-3 sm:px-(--card-spacing)">
        <CardTitle className="flex flex-col items-start gap-1 text-xs leading-tight font-medium text-muted-foreground sm:flex-row sm:items-center sm:gap-2 sm:text-sm">
          <Icon className="size-4" aria-hidden="true" />
          <span>{label}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-3 text-xl font-semibold tabular-nums sm:px-(--card-spacing) sm:text-2xl">
        {children}
      </CardContent>
    </Card>
  );
}

function ActivityRow({
  item,
  slug,
  now,
}: {
  item: ActivityItem;
  slug: string;
  now: Date;
}) {
  const verb =
    item.kind === "update"
      ? "posted an update on"
      : item.kind === "comment"
        ? "commented on"
        : `uploaded ${item.fileName ?? "a file"} to`;

  return (
    <li className="flex items-start gap-3">
      <UserAvatar name={item.authorName} size="sm" className="mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm break-words">
          <span className="font-medium">{item.authorName}</span> {verb}{" "}
          <Link
            href={`/w/${slug}/projects/${item.projectId}`}
            className="font-medium underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground"
          >
            {item.projectName}
          </Link>
        </p>
        <time
          dateTime={item.createdAt}
          title={formatDate(item.createdAt)}
          className="text-xs text-muted-foreground"
        >
          {formatRelative(item.createdAt, now)}
        </time>
      </div>
    </li>
  );
}
