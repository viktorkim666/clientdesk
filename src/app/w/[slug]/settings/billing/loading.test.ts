import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BillingLoading from "./loading";

describe("BillingLoading", () => {
  it("announces itself to assistive tech with role=status", () => {
    const html = renderToStaticMarkup(BillingLoading());

    expect(html).toContain('role="status"');
  });
});
