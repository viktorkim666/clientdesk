"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  demoLimitMessage,
  SAMPLE_DRAFT,
  type DemoLimitReason,
} from "@/lib/ai/demo-limit";
import type { Plan } from "@/lib/billing/plan";
import { draftOutcomeStatusMessage, streamDraft } from "./draft-client";
import { postUpdate, type PostUpdateResult } from "./actions";

const initialState: PostUpdateResult = { ok: true };
const DRAFT_HINT_ID = "draft-update-hint";
const DEMO_LIMIT_ID = "draft-update-demo-limit";

/** Says why the editor holds a sample draft. A polite status, not an alert:
 * it is information, and the visitor has not made a mistake. */
export function DemoLimitNotice({
  reason,
  id,
}: {
  reason: DemoLimitReason;
  id: string;
}) {
  return (
    <p
      id={id}
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-foreground"
    >
      <Badge variant="outline" className="bg-background">
        Sample draft
      </Badge>
      <span>{demoLimitMessage(reason)}</span>
    </p>
  );
}

/** A note after a post that went through with a caveat. */
export function PostWarning({ message }: { message: string }) {
  return (
    <p
      role="status"
      className="rounded-md bg-warning px-3 py-2 text-sm text-warning-foreground"
    >
      {message}
    </p>
  );
}

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
  // Set when the demo's AI draft limit was hit: the editor then holds the
  // saved sample draft and this line says why.
  const [demoLimit, setDemoLimit] = useState<DemoLimitReason | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
        // The sample is gone, so the limit note and the Draft button's
        // explanation go with it.
        setDemoLimit(null);
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

  // The editor now holds the sample; move focus there so keyboard and
  // screen reader users land on the text they can edit.
  useEffect(() => {
    if (demoLimit) textareaRef.current?.focus();
  }, [demoLimit]);

  async function handleDraft() {
    if (!canDraft) return;
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
    if (outcome.status === "demo_limit") {
      setBody(SAMPLE_DRAFT);
      setDemoLimit(outcome.reason);
    }
    setDraftStatus(draftOutcomeStatusMessage(outcome));
  }

  function handleStop() {
    abortControllerRef.current?.abort();
  }

  const alertMessage = draftError ?? (!state.ok ? state.error : null);
  // Another click would only replace the sample (and any edits to it) with
  // the same sample, so the button waits until the update is posted.
  const limited = demoLimit !== null;
  const canDraft = plan === "pro" && aiConfigured && !limited;

  return (
    <form action={formAction} className="space-y-2">
      <Label htmlFor="update-body" className="sr-only">
        Post an update for the client
      </Label>
      <Textarea
        ref={textareaRef}
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
      {demoLimit ? (
        <DemoLimitNotice reason={demoLimit} id={DEMO_LIMIT_ID} />
      ) : null}
      {!drafting && !alertMessage && !demoLimit && draftStatus ? (
        <p
          role="status"
          aria-live="polite"
          className="text-sm text-muted-foreground"
        >
          {draftStatus}
        </p>
      ) : null}
      {state.ok && state.warning ? (
        <PostWarning message={state.warning} />
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending || drafting}>
          {pending ? "Posting..." : "Post update"}
        </Button>
        <span className="inline-flex items-center gap-2 whitespace-nowrap">
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
              disabled={(!canDraft && !limited) || pending}
              aria-disabled={limited || undefined}
              className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:transition-none"
              onClick={() => void handleDraft()}
              title="Replaces the current text with an AI-drafted update."
              aria-describedby={
                limited ? `${DRAFT_HINT_ID} ${DEMO_LIMIT_ID}` : DRAFT_HINT_ID
              }
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
        </span>
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
