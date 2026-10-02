"use client";

import { Trash2 } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteProject } from "./actions";
import {
  describeProjectContents,
  matchesProjectName,
} from "./project-delete-state";

export type ProjectContentCounts = {
  updates: number;
  comments: number;
  files: number;
};

const DELETE_FAILED =
  "Could not delete the project. Reload the page and try again.";

// Deleting a project can't be undone, so the dialog asks for its name. The
// typed name is a guard in the UI only; the action never receives it.
export function DeleteProjectDialog({
  workspaceId,
  workspaceSlug,
  projectId,
  projectName,
  clientName,
  counts,
}: {
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
  projectName: string;
  clientName: string | null;
  counts: ProjectContentCounts;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const nameHintId = useId();
  const errorId = useId();

  // The input is disabled while the delete runs, so after a failure focus can
  // only return to it once the transition has ended.
  useEffect(() => {
    if (!pending && error) {
      inputRef.current?.focus();
    }
  }, [pending, error]);

  const contents = describeProjectContents(counts);
  const matches = matchesProjectName(typed, projectName);

  // A close request (Escape, Cancel) is ignored while the delete runs: the
  // dialog is the only place the user sees what is happening.
  function handleOpenChange(next: boolean) {
    if (pending) {
      return;
    }
    setOpen(next);
    if (!next) {
      setTyped("");
      setError(null);
    }
  }

  function handleSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!matches || pending) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        // On success the action redirects: the client promise rejects with a
        // framework redirect error, which the router turns into the
        // navigation. Only a failure comes back as a result.
        const result = await deleteProject(
          workspaceId,
          workspaceSlug,
          projectId,
        );
        if (result && !result.ok) {
          setError(result.error);
        }
      } catch (caught) {
        // The redirect error is not a failure: let it through, or the dialog
        // would report one and re-enable its buttons mid-navigation.
        unstable_rethrow(caught);
        setError(DELETE_FAILED);
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger
        render={
          <Button type="button" variant="outline" className="max-md:h-11" />
        }
      >
        <Trash2 aria-hidden="true" />
        Delete project
      </AlertDialogTrigger>
      <AlertDialogContent initialFocus={inputRef}>
        <form onSubmit={handleSubmit} className="grid min-w-0 gap-4">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription className="wrap-anywhere">
              {contents
                ? `This permanently deletes "${projectName}" and everything in it: ${contents}. ${clientName ?? "The client"} will no longer see it. This cannot be undone.`
                : `This permanently deletes "${projectName}". It has no updates, comments or files. This cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-project-name">
              Type the project name to confirm
            </Label>
            <Input
              ref={inputRef}
              id="delete-project-name"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={pending}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${nameHintId} ${errorId}` : nameHintId}
            />
            <p
              id={nameHintId}
              className="text-xs wrap-anywhere text-muted-foreground"
            >
              {projectName}
            </p>
          </div>
          {error ? (
            <p id={errorId} role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending} className="max-md:h-11">
              Cancel
            </AlertDialogCancel>
            {/* A solid fill: the soft destructive tint misses 4.5:1 for this
                text size in light mode. */}
            <AlertDialogAction
              type="submit"
              variant="destructive"
              className="bg-destructive text-white hover:bg-destructive/90 max-md:h-11 dark:bg-destructive dark:text-background dark:hover:bg-destructive/90"
              disabled={!matches || pending}
            >
              {pending ? "Deleting..." : "Delete project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
