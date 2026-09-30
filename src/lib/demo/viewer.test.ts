import { describe, expect, it } from "vitest";
import { describeDemoViewer } from "./viewer";

describe("describeDemoViewer", () => {
  it("names an owner as the agency owner and offers the client view", () => {
    expect(
      describeDemoViewer({
        role: "owner",
        fullName: "Maya Chen",
        clientName: null,
      }),
    ).toEqual({
      label: "Viewing as Maya Chen (agency owner)",
      shortLabel: "Maya Chen, agency",
      accountDetail: "Owner",
      switchLabel: "Switch to client view",
      switchShortLabel: "Client view",
    });
  });

  it("names a client with their company and offers the agency view", () => {
    expect(
      describeDemoViewer({
        role: "client",
        fullName: "Priya Nair",
        clientName: "Acme Bakery",
      }),
    ).toEqual({
      label: "Viewing as Priya Nair (client, Acme Bakery)",
      shortLabel: "Priya Nair, client",
      accountDetail: "Client · Acme Bakery",
      switchLabel: "Switch to agency view",
      switchShortLabel: "Agency view",
    });
  });

  it("names a member with no switch", () => {
    expect(
      describeDemoViewer({
        role: "member",
        fullName: "Leo Park",
        clientName: null,
      }),
    ).toEqual({
      label: "Viewing as Leo Park (agency member)",
      shortLabel: "Leo Park, agency",
      accountDetail: "Member",
      switchLabel: null,
      switchShortLabel: null,
    });
  });

  it("drops the company when a client has none, and the name when there is none", () => {
    expect(
      describeDemoViewer({ role: "client", fullName: null, clientName: null })
        .label,
    ).toBe("Viewing as a client");
  });

  it("falls back to plain words for the short label and the account line", () => {
    const client = describeDemoViewer({
      role: "client",
      fullName: null,
      clientName: null,
    });
    expect(client.shortLabel).toBe("Client");
    expect(client.accountDetail).toBe("Client");

    const owner = describeDemoViewer({
      role: "owner",
      fullName: "",
      clientName: null,
    });
    expect(owner.shortLabel).toBe("Agency owner");
  });
});
