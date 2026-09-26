import { readFile } from "node:fs/promises";
import path from "node:path";

const OUTPUT_FILE = path.join(process.cwd(), ".local", "emails.jsonl");

/**
 * Reads the invite URL the console email sender wrote for `to`, so specs can
 * follow an invitation link without a real inbox. Filters by recipient
 * (rather than just taking the last line) so parallel specs using distinct
 * emails don't race each other.
 */
export async function readLastInviteUrlFor(to: string): Promise<string> {
  const content = await readFile(OUTPUT_FILE, "utf8");
  const lines = content.trim().split("\n").filter(Boolean);
  const matches = lines
    .map((line) => JSON.parse(line) as { to: string; inviteUrl: string })
    .filter((record) => record.to === to);

  const last = matches.at(-1);
  if (!last) {
    throw new Error(`No invitation email found for ${to} in ${OUTPUT_FILE}`);
  }
  return last.inviteUrl;
}
