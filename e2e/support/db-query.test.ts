import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseDbQueryRows } from "./db-query";

const rowSchema = z.object({ x: z.number() });

describe("parseDbQueryRows", () => {
  it("accepts a bare array of rows", () => {
    expect(parseDbQueryRows('[{"x":1},{"x":2}]', rowSchema)).toEqual([
      { x: 1 },
      { x: 2 },
    ]);
  });

  it("accepts the envelope printed when an AI agent env var is set", () => {
    const stdout = JSON.stringify({
      boundary: "abc",
      rows: [{ x: 1 }],
      warning: "untrusted data",
    });
    expect(parseDbQueryRows(stdout, rowSchema)).toEqual([{ x: 1 }]);
  });

  it("returns an empty list for an empty result in either shape", () => {
    expect(parseDbQueryRows("[]", rowSchema)).toEqual([]);
    expect(parseDbQueryRows('{"rows":[]}', rowSchema)).toEqual([]);
  });

  it("throws when a row does not match the schema", () => {
    expect(() => parseDbQueryRows('[{"x":"1"}]', rowSchema)).toThrow(
      /Unexpected output/,
    );
    expect(() => parseDbQueryRows('{"rows":[{"y":1}]}', rowSchema)).toThrow(
      /Unexpected output/,
    );
  });

  it("throws on an object without rows, a scalar or a null", () => {
    expect(() => parseDbQueryRows('{"error":"boom"}', rowSchema)).toThrow(
      /Unexpected output/,
    );
    expect(() => parseDbQueryRows("42", rowSchema)).toThrow(
      /Unexpected output/,
    );
    expect(() => parseDbQueryRows("null", rowSchema)).toThrow(
      /Unexpected output/,
    );
  });

  it("throws on output that is not JSON", () => {
    expect(() => parseDbQueryRows("not json", rowSchema)).toThrow(
      /not valid JSON/,
    );
  });
});
