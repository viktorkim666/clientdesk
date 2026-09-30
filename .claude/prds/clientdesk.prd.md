# Clientdesk

A client portal for small agencies, where the agency and its clients see project status, files and updates in one place.

## Problem

Small agencies of 2 to 10 people keep client communication spread across email, Slack and shared drives. Clients keep asking "where are we on this?", files get lost between threads, and someone on the team writes weekly status updates by hand. The team's internal tools (ClickUp, Notion) are awkward to open up to clients, and dedicated client-portal products cost more than a small agency wants to pay.

## Evidence

- Assumption, needs validation via user interviews with agency owners. Nobody has been interviewed yet.
- This is a portfolio project, built to show Upwork clients a typical SaaS MVP done end to end. Market data supports that goal (Upwork In-Demand Skills 2026, Vibeworker for June and July 2026, 2026 MVP cost guides). AI integration is the fastest-growing coding skill on Upwork at +178% YoY, and the "full-featured SaaS MVP" clients ask for usually includes multi-role access, team invites, subscription billing, file sharing, a dashboard and at least one AI feature.

## Users

- **Primary**: owner or project manager at a small design, web or marketing agency. The need shows up when a client asks for a status update or can't find a deliverable.
- **Secondary**: the agency's client, who logs in to check progress, download files and comment.
- **Portfolio audience**: an Upwork client looking at the demo to decide whether to hire the developer.
- **Not for**: in-house teams without external clients, and agencies that need task management, time tracking or invoicing.

## Hypothesis

We believe **a shared portal with project status, files, an update feed and an AI-drafted client update** will **replace scattered email and chat threads** for **small agencies and their clients**.
For the portfolio, we'll know we're right when **an Upwork client can open the live demo, try both the agency and the client role, and see roles, billing and the AI feature working within 2 minutes, without signing up**.

## Success Metrics

| Metric                                                  | Target                                                              | How measured                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| Time from landing page to seeing both roles in the demo | ≤ 2 min                                                             | Timed walkthrough by a person who hasn't seen the app       |
| Demo works without signup                               | 100% of attempts                                                    | Manual check after each deploy                              |
| Client role cannot see another client's data            | 0 leaks                                                             | Automated access tests for each role                        |
| Portfolio effect                                        | TBD, needs validation via proposal and interview tracking on Upwork | Interviews or replies where the client mentions the project |

## Scope

**MVP**

- Sign up with email or Google, create a workspace, invite members and clients by email. A client sees only their own projects.
- Projects have a status, files, and a feed of updates and comments. A dashboard lists active projects and recent activity. The client gets an email when a new update is posted.
- Billing has a Free plan (up to 2 clients, no AI) and a Pro plan (unlimited clients, AI included), with checkout, self-serve subscription management, and plan state kept in sync with the payment provider. The demo runs in test mode.
- AI: a "Draft update" action turns the last week of project activity into a client update, which a member edits and publishes. Output streams in, and requests are rate-limited.
- Demo: "Try as agency" and "Try as client" buttons log straight into a seeded workspace. Demo data resets on a schedule.
- Live deploy, public repository, README and a short video walkthrough.

**Out of scope**

- Realtime chat and task tracking or kanban. Task tracking is a different product, and chat isn't needed to test the hypothesis.
- Invoicing and time tracking. About a week of extra work, and the demo doesn't need it.
- White-label, custom domains, i18n. Portals usually add these later, and the hypothesis doesn't depend on them.
- Mobile app, push notifications and a public API. The web app is responsive; the mobile client and a separate backend service come in the follow-up project, Clientdesk Mobile.

## Delivery Milestones

<!-- Status: pending | in-progress | complete -->

| #   | Milestone            | Outcome                                                                                                          | Status      | Plan                                              |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------- |
| 1   | Workspaces and roles | A user signs up, creates a workspace, and invites a member and a client; the client sees only their own projects | complete    | `.claude/plans/workspaces-and-roles.plan.md`      |
| 2   | Projects             | The agency posts status, files and updates; the client reads, downloads, comments and gets an email              | complete    | `.claude/plans/projects.plan.md`                  |
| 3   | Billing              | A workspace upgrades to Pro and manages its own subscription; Free-plan limits are enforced                      | complete    | `.claude/plans/billing.plan.md`                   |
| 4   | AI update draft      | A member generates, edits and publishes a weekly client update                                                   | complete    | `.claude/plans/ai-update-draft.plan.md`           |
| 4.5 | Design               | The app and a landing page look like a finished product in both themes and on a phone                            | complete    | `.claude/prds/clientdesk-design.prd.md`           |
| 5   | Demo and launch      | A visitor tries both roles in one click on the live site; README and walkthrough video are published             | in-progress | `.claude/plans/brand-and-polish.plan.md` (1 of 2) |

## Open Questions

- [ ] How often does demo data reset, and do demo visitors share one workspace or each get a fresh copy? This decides whether visitors see each other's edits.
- [ ] How do we cap AI spend on the public demo: a per-visitor limit, a daily budget, or cached sample output?
- [ ] Can demo visitors reach the payment flow in test mode, or is billing shown read-only?
- [ ] What file size and type limits apply to uploads, especially on the public demo?

## Risks

| Risk                                                                      | Likelihood | Impact | Mitigation                                                           |
| ------------------------------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------------- |
| Access rules leak one client's data to another                            | Medium     | High   | Automated access tests for every role before each milestone closes   |
| Public demo gets abused through spam uploads or AI cost                   | Medium     | Medium | Rate limits, upload limits, scheduled reset                          |
| The two-week timebox slips because of the Deguster client or the main job | High       | Medium | Milestones ship one at a time, and each one can be demoed on its own |
| Billing webhooks drift out of sync with plan state                        | Low        | Medium | Idempotent event handling and a manual resync path                   |

_Status: DRAFT, requirements only. Implementation planning pending via /plan._
