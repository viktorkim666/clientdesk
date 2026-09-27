import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createConsoleEmailSender } from "@/lib/email/console-sender";

describe("createConsoleEmailSender", () => {
  let dir: string;
  let outputFile: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "clientdesk-email-"));
    outputFile = path.join(dir, "emails.jsonl");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("appends a JSON line with the invite url for every call, in order", async () => {
    const sender = createConsoleEmailSender(outputFile);

    await sender.sendInvitationEmail({
      to: "client-a@clientdesk.test",
      workspaceName: "Acme Agency",
      inviteUrl: "http://localhost:3000/invite/token-1",
    });
    await sender.sendInvitationEmail({
      to: "client-b@clientdesk.test",
      workspaceName: "Acme Agency",
      inviteUrl: "http://localhost:3000/invite/token-2",
    });

    const lines = (await readFile(outputFile, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(2);

    const first = JSON.parse(lines[0]) as { to: string; inviteUrl: string };
    expect(first.to).toBe("client-a@clientdesk.test");
    expect(first.inviteUrl).toBe("http://localhost:3000/invite/token-1");

    const second = JSON.parse(lines[1]) as { to: string; inviteUrl: string };
    expect(second.to).toBe("client-b@clientdesk.test");
    expect(second.inviteUrl).toBe("http://localhost:3000/invite/token-2");
  });

  it("appends a JSON line with the project update for the recipient", async () => {
    const sender = createConsoleEmailSender(outputFile);

    await sender.sendProjectUpdateEmail({
      to: "client-a@clientdesk.test",
      workspaceName: "Acme Agency",
      projectName: "Website Redesign",
      body: "Kickoff call notes.",
      projectUrl: "http://localhost:3000/w/acme-agency/projects/project-1",
    });

    const lines = (await readFile(outputFile, "utf8")).trim().split("\n");
    expect(lines).toHaveLength(1);

    const record = JSON.parse(lines[0]) as {
      to: string;
      projectUrl: string;
      body: string;
    };
    expect(record.to).toBe("client-a@clientdesk.test");
    expect(record.projectUrl).toBe(
      "http://localhost:3000/w/acme-agency/projects/project-1",
    );
    expect(record.body).toBe("Kickoff call notes.");
  });
});
