"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { ProjectStatus } from "@/lib/validation/project";
import { createProject, type ProjectActionResult } from "./actions";

const initialState: ProjectActionResult = { ok: true };
const STATUSES: ProjectStatus[] = ["active", "on_hold", "done"];

export function NewProjectDialog({
  workspaceId,
  workspaceSlug,
  clients,
}: {
  workspaceId: string;
  workspaceSlug: string;
  clients: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [status, setStatus] = useState<ProjectStatus>("active");

  const [state, formAction, pending] = useActionState(
    async (_prev: ProjectActionResult, formData: FormData) => {
      const result = await createProject(workspaceId, workspaceSlug, formData);
      if (result.ok) {
        setOpen(false);
      }
      return result;
    },
    initialState,
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button size="sm" disabled={clients.length === 0} />}
      >
        New project
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Project name</Label>
            <Input id="name" name="name" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="clientId">Client</Label>
            <Select
              value={clientId}
              onValueChange={(value) => setClientId(value ?? "")}
            >
              <SelectTrigger id="clientId">
                <SelectValue placeholder="Choose a client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="clientId" value={clientId} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select
              value={status}
              onValueChange={(value) => {
                if (value) setStatus(value as ProjectStatus);
              }}
            >
              <SelectTrigger id="status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((candidate) => (
                  <SelectItem key={candidate} value={candidate}>
                    {candidate.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="status" value={status} />
          </div>
          {!state.ok ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
