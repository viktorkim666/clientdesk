import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FREE_CLIENT_LIMIT } from "@/lib/billing/plan";
import { ProductPreview } from "./product-preview";
import {
  BillingPreview,
  DraftPreview,
  FilesPreview,
  RolesPreview,
} from "./feature-previews";

const previews: [string, ComponentType][] = [
  ["ProductPreview", ProductPreview],
  ["RolesPreview", RolesPreview],
  ["FilesPreview", FilesPreview],
  ["DraftPreview", DraftPreview],
  ["BillingPreview", BillingPreview],
];

describe.each(previews)("%s", (_name, Preview) => {
  const html = renderToStaticMarkup(createElement(Preview));
  const rootTag = html.match(/^<[^>]+>/)?.[0] ?? "";

  it("is hidden from assistive tech and inert", () => {
    expect(rootTag).toContain('aria-hidden="true"');
    expect(rootTag).toMatch(/\sinert(=""|\s|>)/);
  });

  it("contains no links, buttons or headings", () => {
    expect(html).not.toMatch(/<(a|button|h[1-6])[\s>]/);
  });
});

describe("ProductPreview", () => {
  const html = renderToStaticMarkup(createElement(ProductPreview));

  it("shows a fake address bar, project statuses and the floating update", () => {
    expect(html).toContain("clientdesk.app/w/northwind");
    expect(html).toContain("Active");
    expect(html).toContain("On hold");
    expect(html).toContain("Northwind Studio");
  });
});

describe("BillingPreview", () => {
  const html = renderToStaticMarkup(createElement(BillingPreview));

  it("derives the Free limit from the plan constant", () => {
    expect(html).toContain(`Up to ${FREE_CLIENT_LIMIT} clients`);
    expect(html).toContain("Unlimited clients");
    expect(html).toContain("AI update drafts");
    expect(html).toContain("Stripe");
  });
});

describe("RolesPreview", () => {
  it("lists the three roles", () => {
    const html = renderToStaticMarkup(createElement(RolesPreview));
    for (const role of ["Owner", "Member", "Client"]) {
      expect(html).toContain(role);
    }
    expect(html).toContain("row-level security");
  });
});
