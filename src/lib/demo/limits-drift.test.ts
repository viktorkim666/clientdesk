import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEMO_AI_DRAFT_LIMIT } from "@/lib/ai/demo-limit";
import {
  DEMO_ALLOWED_MIME_TYPES,
  DEMO_MAX_FILE_BYTES,
  DEMO_MAX_NEW_FILES,
} from "@/lib/validation/file";

// The demo limits are enforced in SQL and repeated in TypeScript so the app
// can refuse early and explain. Nothing links the two copies, so this test
// reads the constants out of the migration text and fails when they differ.

function migration(name: string): string {
  return readFileSync(
    fileURLToPath(
      new URL(`../../../supabase/migrations/${name}`, import.meta.url),
    ),
    "utf8",
  );
}

const aiLimits = migration("20261001100000_demo_ai_limits.sql");
const uploadLimits = migration("20261001110000_demo_upload_limits.sql");

/** The text between `name constant type :=` and the next `;`. */
function sqlConstant(sql: string, name: string): string {
  const match = new RegExp(
    `${name}\\s+constant\\s+[\\w\\[\\]]+\\s*:=\\s*([^;]+);`,
  ).exec(sql);
  if (!match) {
    throw new Error(`constant ${name} not found in the migration`);
  }
  return match[1].trim();
}

/** Evaluates a product of integers such as `2 * 1024 * 1024`. */
function sqlProduct(expression: string): number {
  return expression
    .split("*")
    .map((factor) => Number(factor.trim()))
    .reduce((product, factor) => product * factor, 1);
}

function sqlTextArray(expression: string): string[] {
  return [...expression.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe("demo limits in SQL and TypeScript", () => {
  it("allows the same number of AI drafts per sandbox", () => {
    expect(sqlProduct(sqlConstant(aiLimits, "c_demo_sandbox_limit"))).toBe(
      DEMO_AI_DRAFT_LIMIT,
    );
  });

  it("keeps the daily AI budget at 150, the figure the pgTAP fixtures and the docs use", () => {
    // There is no TypeScript copy of the budget: the app only learns of it
    // through the CD004 message.
    expect(sqlProduct(sqlConstant(aiLimits, "c_demo_daily_budget"))).toBe(150);
  });

  it("allows the same number of uploads per sandbox", () => {
    expect(sqlProduct(sqlConstant(uploadLimits, "c_max_files"))).toBe(
      DEMO_MAX_NEW_FILES,
    );
  });

  it("allows the same file size", () => {
    expect(sqlProduct(sqlConstant(uploadLimits, "c_max_bytes"))).toBe(
      DEMO_MAX_FILE_BYTES,
    );
  });

  it("allows the same file types", () => {
    const sqlTypes = sqlTextArray(sqlConstant(uploadLimits, "c_allowed_types"));

    expect(sqlTypes.length).toBeGreaterThan(0);
    expect([...sqlTypes].sort()).toEqual([...DEMO_ALLOWED_MIME_TYPES].sort());
  });

  it("reads the constants it compares (a renamed constant fails here, not silently)", () => {
    expect(() => sqlConstant(uploadLimits, "c_no_such_constant")).toThrow(
      /not found/,
    );
  });
});
