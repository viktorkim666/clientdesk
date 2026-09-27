import { describe, expect, it } from "vitest";
import { FREE_CLIENT_LIMIT, planFromStatus } from "@/lib/billing/plan";

describe("FREE_CLIENT_LIMIT", () => {
  it("matches the SQL trigger's limit", () => {
    expect(FREE_CLIENT_LIMIT).toBe(2);
  });
});

describe("planFromStatus", () => {
  it.each(["active", "trialing", "past_due"])("treats %s as pro", (status) => {
    expect(planFromStatus(status)).toBe("pro");
  });

  it.each([
    "canceled",
    "incomplete",
    "incomplete_expired",
    "unpaid",
    "paused",
    "some_future_status",
  ])("treats %s as free", (status) => {
    expect(planFromStatus(status)).toBe("free");
  });

  it("treats no subscription (null) as free", () => {
    expect(planFromStatus(null)).toBe("free");
  });
});
