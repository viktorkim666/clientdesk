import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspace } from "@/lib/workspace/current";
import { FREE_CLIENT_LIMIT, planFromStatus } from "@/lib/billing/plan";
import { NewClientDialog } from "./new-client-dialog";

export default async function ClientsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const workspace = await getCurrentWorkspace(supabase, slug);

  const [{ data: clients }, { data: billingRow }] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("workspace_billing")
      .select("subscription_status")
      .eq("workspace_id", workspace.id)
      .maybeSingle(),
  ]);

  const canManage = workspace.role === "owner" || workspace.role === "member";
  const clientCount = clients?.length ?? 0;
  const plan = planFromStatus(billingRow?.subscription_status ?? null);
  const atFreeLimit = plan === "free" && clientCount >= FREE_CLIENT_LIMIT;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Clients</h1>
        {canManage ? (
          <NewClientDialog
            workspaceId={workspace.id}
            workspaceSlug={workspace.slug}
          />
        ) : null}
      </div>
      {plan === "free" ? (
        <p className="text-sm text-muted-foreground">
          {clientCount} / {FREE_CLIENT_LIMIT} clients used.
          {atFreeLimit && canManage ? (
            <>
              {" "}
              <Link
                href={`/w/${workspace.slug}/settings/billing`}
                className="underline"
              >
                Upgrade to Pro
              </Link>{" "}
              to add more.
            </>
          ) : null}
        </p>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(clients ?? []).map((client) => (
            <TableRow key={client.id}>
              <TableCell>{client.name}</TableCell>
            </TableRow>
          ))}
          {(clients ?? []).length === 0 ? (
            <TableRow>
              <TableCell className="text-muted-foreground">
                No clients yet.
              </TableCell>
            </TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}
