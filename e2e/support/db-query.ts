import { z } from "zod";

/**
 * Parses the stdout of `supabase db query -o json` into validated rows.
 *
 * The CLI prints a bare JSON array normally, but wraps it as
 * `{ boundary, rows, warning }` when an AI-agent environment variable is set
 * (for example AI_AGENT). Both shapes are accepted. Anything else throws, so
 * callers never build SQL from output they did not expect.
 */
export function parseDbQueryRows<Row extends z.ZodType>(
  stdout: string,
  rowSchema: Row,
): z.infer<Row>[] {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    throw new Error(
      'Unexpected output from "supabase db query -o json": not valid JSON',
    );
  }

  const parsed = z
    .union([
      z.array(rowSchema),
      z.object({ rows: z.array(rowSchema) }).transform((data) => data.rows),
    ])
    .safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Unexpected output from "supabase db query -o json": ${parsed.error.message}`,
    );
  }
  return parsed.data;
}
