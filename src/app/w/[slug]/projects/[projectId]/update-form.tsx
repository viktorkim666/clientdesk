"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Plan } from "@/lib/billing/plan";
import { draftOutcomeStatusMessage, streamDraft } from "./draft-client";
import { postUpdate, type PostUpdateResult } from "./actions";

const initialState: PostUpdateResult = { ok: true };
const DRAFT_HINT_ID = "draft-update-hint";

export function UpdateForm({
  workspaceId,
  workspaceSlug,
  projectId,
  plan,
  aiConfigured,
}: {
  workspaceId: string;
  workspaceSlug: string;
  projectId: string;
  plan: Plan;
  aiConfigured: boolean;
}) {
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  // The persistent "Draft added."/"Draft stopped." status line, shown once
  // drafting ends and kept on screen (unlike the transient "Drafting..."
  // line) until the user types, posts, or starts another draft.
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [state, formAction, pending] = useActionState(
    async (_prev: PostUpdateResult, formData: FormData) => {
      setDraftStatus(null);
      const result = await postUpdate(
        workspaceId,
        workspaceSlug,
        projectId,
        formData,
      );
      if (result.ok) {
        setBody("");
      }
      return result;
    },
    initialState,
  );

  // Aborts an in-flight draft when the form leaves the page instead of
  // letting the fetch and its reader keep running unread.
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  async function handleDraft() {
    setDraftError(null);
    setDraftStatus(null);
    setBody("");
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setDrafting(true);

    const outcome = await streamDraft({
      fetch,
      projectId,
      signal: controller.signal,
      onChunk: (chunk) => setBody((prev) => prev + chunk),
    });

    abortControllerRef.current = null;
    setDrafting(false);
    if (outcome.status === "error") {
      setDraftError(outcome.message);
    }
    setDraftStatus(draftOutcomeStatusMessage(outcome));
  }

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  const alertMessage = draftError ?? (!state.ok ? state.error : null);
  const canDraft = plan === "pro" && aiConfigured;

  return (
    <form action={formAction} className="space-y-2">
      <Label htmlFor="update-body" className="sr-only">
        Post an update for the client
      </Label>
      <textarea
        id="update-body"
        name="body"
        value={body}
        onChange={(event) => {
          setBody(event.target.value);
          setDraftStatus(null);
        }}
        required
        readOnly={drafting}
        rows={3}
        placeholder="Post an update for the client..."
        className="w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      {drafting ? (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-muted-foreground"
        >
          Drafting...
        </p>
      ) : null}
      {alertMessage ? (
        <p role="alert" className="text-sm text-destructive">
          {alertMessage}
        </p>
      ) : null}
      {!drafting && !alertMessage && draftStatus ? (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-muted-foreground"
        >
          {draftStatus}
        </p>
      ) : null}
      {state.ok && state.warning ? (
        <p role="status" className="text-sm text-amber-600">
          {state.warning}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending || drafting}>
          {pending ? "Posting..." : "Post update"}
        </Button>
        {drafting ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleStop}
          >
            Stop
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canDraft || pending}
            onClick={() => void handleDraft()}
            title="Replaces the current text with an AI-drafted update."
            aria-describedby={DRAFT_HINT_ID}
          >
            <Sparkles /> Draft update
          </Button>
        )}
        {plan === "free" ? (
          <>
            <Badge variant="secondary">Pro</Badge>
            <Link
              href={`/w/${workspaceSlug}/settings/billing`}
              className="text-sm underline"
            >
              Upgrade
            </Link>
          </>
        ) : null}
      </div>
      {!aiConfigured && plan === "pro" ? (
        <p className="text-xs text-muted-foreground">
          AI drafting is not configured.
        </p>
      ) : null}
      <span id={DRAFT_HINT_ID} className="sr-only">
        Replaces the current text with an AI-drafted update.
      </span>
    </form>
  );
}
