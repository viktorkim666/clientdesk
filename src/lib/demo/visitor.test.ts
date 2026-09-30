import { describe, expect, it } from "vitest";
import { hashVisitor, resolveVisitorSalt } from "./visitor";

function headers(values: Record<string, string>) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null };
}

describe("hashVisitor", () => {
  it("returns a sha256 hex digest that does not contain the address", () => {
    const hash = hashVisitor(
      headers({ "x-forwarded-for": "203.0.113.7" }),
      "s",
    );

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain("203.0.113.7");
  });

  it("uses only the first x-forwarded-for entry", () => {
    const first = hashVisitor(
      headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" }),
      "s",
    );
    const alone = hashVisitor(
      headers({ "x-forwarded-for": "203.0.113.7" }),
      "s",
    );

    expect(first).toBe(alone);
  });

  it("gives different visitors different hashes", () => {
    const one = hashVisitor(headers({ "x-forwarded-for": "203.0.113.7" }), "s");
    const two = hashVisitor(headers({ "x-forwarded-for": "203.0.113.8" }), "s");

    expect(one).not.toBe(two);
  });

  it("changes with the salt", () => {
    const h = headers({ "x-forwarded-for": "203.0.113.7" });

    expect(hashVisitor(h, "a")).not.toBe(hashVisitor(h, "b"));
  });

  it("falls back to x-real-ip when x-forwarded-for is absent or blank", () => {
    const real = hashVisitor(headers({ "x-real-ip": "198.51.100.4" }), "s");

    expect(
      hashVisitor(
        headers({ "x-forwarded-for": " ", "x-real-ip": "198.51.100.4" }),
        "s",
      ),
    ).toBe(real);
    expect(
      hashVisitor(headers({ "x-forwarded-for": "198.51.100.4" }), "s"),
    ).toBe(real);
  });

  it('falls back to "unknown" when no header names an address', () => {
    expect(hashVisitor(headers({}), "s")).toBe(
      hashVisitor(headers({ "x-real-ip": "unknown" }), "s"),
    );
  });
});

describe("hashVisitor with IPv6 addresses", () => {
  const hashOf = (address: string) =>
    hashVisitor(headers({ "x-forwarded-for": address }), "s");

  it("gives every address in one /64 the same hash", () => {
    expect(hashOf("2001:db8:1:2::1")).toBe(
      hashOf("2001:db8:1:2:aaaa:bbbb:cccc:dddd"),
    );
    expect(hashOf("2001:db8:1:2::1")).toBe(
      hashOf("2001:0DB8:0001:0002:0:0:0:9"),
    );
  });

  it("separates different /64 prefixes", () => {
    expect(hashOf("2001:db8:1:2::1")).not.toBe(hashOf("2001:db8:1:3::1"));
    expect(hashOf("2001:db8:1:2::1")).not.toBe(hashOf("2001:db9:1:2::1"));
  });

  it("expands the :: shorthand before taking the prefix", () => {
    expect(hashOf("2001:db8::1")).toBe(hashOf("2001:db8:0:0:5:5:5:5"));
    expect(hashOf("::1")).toBe(hashOf("0:0:0:0:1:2:3:4"));
  });

  it("treats an IPv4-mapped address as the IPv4 address", () => {
    expect(hashOf("::ffff:203.0.113.7")).toBe(hashOf("203.0.113.7"));
  });

  it("hashes a value that is not an address as it is", () => {
    expect(hashOf("not-an-address")).toBe(hashOf("not-an-address"));
    expect(hashOf("not-an-address")).not.toBe(hashOf("other-text"));
  });
});

describe("resolveVisitorSalt", () => {
  it("returns the configured salt", () => {
    expect(resolveVisitorSalt({ salt: "abc", isProduction: true })).toBe("abc");
  });

  it("reports not configured in production without a salt", () => {
    expect(
      resolveVisitorSalt({ salt: undefined, isProduction: true }),
    ).toBeNull();
  });

  it("uses a fixed development salt outside production", () => {
    const salt = resolveVisitorSalt({ salt: undefined, isProduction: false });

    expect(typeof salt).toBe("string");
    expect(salt).not.toBe("");
  });
});
