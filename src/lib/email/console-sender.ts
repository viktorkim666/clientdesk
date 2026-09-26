import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { EmailSender, SendInvitationEmailParams } from "@/lib/email/types";

const DEFAULT_OUTPUT_FILE = path.join(process.cwd(), ".local", "emails.jsonl");

/**
 * Logs every invitation email to the console and appends it as a JSON line
 * to `outputFile`, so Playwright specs (see e2e/) can read the invite link
 * deterministically instead of parsing stdout or standing up a real inbox.
 */
export function createConsoleEmailSender(
  outputFile: string = DEFAULT_OUTPUT_FILE,
): EmailSender {
  return {
    async sendInvitationEmail(params: SendInvitationEmailParams) {
      const record = { sentAt: new Date().toISOString(), ...params };
      console.log(
        `[email:console] invitation to ${params.to}: ${params.inviteUrl}`,
      );
      await mkdir(path.dirname(outputFile), { recursive: true });
      await appendFile(outputFile, `${JSON.stringify(record)}\n`, "utf8");
    },
  };
}

export const consoleEmailSender = createConsoleEmailSender();
