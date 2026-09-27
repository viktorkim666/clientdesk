export type ActionOutcome = { ok: true } | { ok: false; error: string };

/**
 * Runs a Server Action after an optimistic value has already been applied
 * synchronously, and undoes that optimism if the action rejects or throws.
 *
 * Shared by `member-row.tsx` and `status-control.tsx`: both set their
 * optimistic value outside `startTransition` (so it renders immediately),
 * then call this inside `startTransition` to run the action and, on
 * failure, revert via a caller-supplied closure and report an error.
 * `revert` is optional because `handleRemove` in `member-row.tsx` has no
 * optimistic value to undo.
 */
export async function applyOptimisticAction({
  action,
  revert,
  onError,
  fallbackMessage,
}: {
  action: () => Promise<ActionOutcome>;
  revert?: () => void;
  onError: (message: string) => void;
  fallbackMessage: string;
}): Promise<void> {
  try {
    const result = await action();
    if (!result.ok) {
      revert?.();
      onError(result.error);
    }
  } catch {
    // The Server Action call itself failed (e.g. a network error), so there
    // is no `ActionOutcome` to read; fall back to a generic message.
    revert?.();
    onError(fallbackMessage);
  }
}
