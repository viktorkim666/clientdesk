/**
 * What the draft form shows when `claim_ai_draft` refuses a demo sandbox
 * (CD004): an honest message and a saved sample draft the visitor can still
 * edit and publish.
 */

/** Drafts one sandbox may request. The database enforces it
 * (`c_demo_sandbox_limit` in supabase/migrations/20261001100000_demo_ai_limits.sql);
 * this copy is only for the message. */
export const DEMO_AI_DRAFT_LIMIT = 3;

/** The `error` value the draft route sends with a 429 when a demo sandbox is
 * out of AI drafts (CD004). A flag, not display text. */
export const DEMO_LIMIT_ERROR = "demo_limit";

/** Which demo limit was hit: the sandbox's own drafts, or the daily budget
 * shared by every sandbox. */
export type DemoLimitReason = "sandbox" | "budget";

/** Narrows an untrusted `reason` from a response body; anything unknown is
 * the sandbox limit. */
export function toDemoReason(value: unknown): DemoLimitReason {
  return value === "budget" ? "budget" : "sandbox";
}

export function demoLimitMessage(reason: DemoLimitReason): string {
  if (reason === "budget") {
    return "The AI drafts for all demos are used up for today. Here's a sample draft you can still edit and publish.";
  }
  return `You've used the ${DEMO_AI_DRAFT_LIMIT} AI drafts in this demo. Here's a sample draft you can still edit and publish.`;
}

/**
 * A neutral weekly-update template, written by hand, not by a model. It
 * claims no concrete work, so it stays true on any project in the Northwind
 * template and the visitor can edit it before posting. The form labels it as
 * a sample next to the text field instead of inside the text, so publishing
 * it posts only the update.
 */
export const SAMPLE_DRAFT = `Here is this week's update.

This week we kept working through the open items on this project. Anything we have ready for you to review will be added to Files, and you can open it whenever it suits you.

Next week we will continue with the remaining items. If you have a question or some feedback, add a comment under this update and we will pick it up from there.

Thanks for staying in touch.
`;
