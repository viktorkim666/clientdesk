import { describe, expect, it, vi } from "vitest";
import { applyOptimisticAction } from "./optimistic-action";

describe("applyOptimisticAction", () => {
  it("keeps the optimistic value and reports no error when the action succeeds", async () => {
    const revert = vi.fn();
    const onError = vi.fn();

    await applyOptimisticAction({
      action: () => Promise.resolve({ ok: true }),
      revert,
      onError,
      fallbackMessage: "fallback",
    });

    expect(revert).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("reverts and reports the action's own error when it returns { ok: false }", async () => {
    const revert = vi.fn();
    const onError = vi.fn();

    await applyOptimisticAction({
      action: () => Promise.resolve({ ok: false, error: "Role already taken" }),
      revert,
      onError,
      fallbackMessage: "fallback",
    });

    expect(revert).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith("Role already taken");
  });

  it("reverts and reports the fallback message when the action throws", async () => {
    const revert = vi.fn();
    const onError = vi.fn();

    await applyOptimisticAction({
      action: () => Promise.reject(new Error("network error")),
      revert,
      onError,
      fallbackMessage: "Could not change this member's role",
    });

    expect(revert).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith("Could not change this member's role");
  });

  it("reports the fallback message even when no revert callback is given", async () => {
    const onError = vi.fn();

    await expect(
      applyOptimisticAction({
        action: () => Promise.reject(new Error("network error")),
        onError,
        fallbackMessage: "Could not remove this member",
      }),
    ).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledWith("Could not remove this member");
  });
});
