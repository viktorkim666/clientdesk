import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type {
  EmailSender,
  SendInvitationEmailParams,
  SendProjectUpdateEmailParams,
} from "@/lib/email/types";

const DEFAULT_OUTPUT_FILE = path.join(process.cwd(), ".local", "emails.jsonl");

/**
 * Logs every email to the console and appends it as a JSON line to
 * `outputFile`, so Playwright specs (see e2e/) can read an invite link or a
 * project update deterministically instead of parsing stdout or standing up
 * a real inbox. Every record carries `to`, so a spec can filter by recipient.
 */
export function createConsoleEmailSender(
  outputFile: string = DEFAULT_OUTPUT_FILE,
): EmailSender {
  async function appendRecord(record: Record<string, unknown>) {
    await mkdir(path.dirname(outputFile), { recursive: true });
    await appendFile(outputFile, `${JSON.stringify(record)}\n`, "utf8");
  }

  return {
    async sendInvitationEmail(params: SendInvitationEmailParams) {
      console.log(
        `[email:console] invitation to ${params.to}: ${params.inviteUrl}`,
      );
      await appendRecord({ sentAt: new Date().toISOString(), ...params });
    },
    async sendProjectUpdateEmail(params: SendProjectUpdateEmailParams) {
      console.log(
        `[email:console] project update to ${params.to}: ${params.projectUrl}`,
      );
      await appendRecord({ sentAt: new Date().toISOString(), ...params });
    },
  };
}

export const consoleEmailSender = createConsoleEmailSender();
