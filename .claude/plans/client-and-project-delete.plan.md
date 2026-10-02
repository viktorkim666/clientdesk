# Plan: rename and delete clients, delete projects

**Source**: owner request on 2026-10-02, found on the live site (a Free workspace at 2 / 2 clients had no way to free a slot).
**Complexity**: Medium to large, one pull request on `feat/client-manage`, six commits, merged with rebase.

## Summary

Staff (owner and member) can rename a client, delete an empty client and delete a project with everything in it. A client that has projects or people cannot be deleted; a dialog says why and what to do first. The account menu's "Sign out" item gets the full menu width.

## Decisions

Made by the owner at Gate 1 (2026-10-02):

- **Blocked, with an explanation.** A client with projects or with people who sign in as that client is not deleted. No cascade over projects, no archive.
- **Project deletion is in this pull request**, for owner and member. The confirmation asks for the project name.
- **Invitations go with the client.** Unused invitations do not block; the confirmation says how many will stop working.
- **Sign out width** is fixed in a separate `fix(ui)` commit in this pull request.

Technical decisions:

- **Invitations foreign key cascades.** `invitations (client_id, workspace_id) -> clients` becomes `on delete cascade`. Accepted and expired rows otherwise block a delete forever, and only the owner may delete them. The `projects` and `workspace_members` foreign keys stay `no action`, so the rule holds in the database and a project created between the check and the delete still raises 23503.
- **No migration or RPC for projects.** `projects_delete` allows owner and member, and every child table (`project_updates`, `update_comments`, `project_files`, `ai_draft_requests`) cascades.
- **AI draft requests survive a project delete.** Found in review: the per-user and per-workspace draft limits count `ai_draft_requests` rows, and those cascaded with the project, so deleting a project reset the limits. Migration `20261002110000_ai_draft_requests_survive_project_delete.sql` makes `project_id` nullable and sets it to null on delete.
- **The Storage prefix comes from the stored ids.** Found in review: an upper-case id matched the row but not the case-sensitive Storage prefix. The caller's workspace slug is checked against the slug format before it reaches `revalidatePath` or `redirect`.
- **Storage objects go first.** `storage.remove()` needs both delete and select rights on the object (Supabase docs), and the select policy needs the project row. So the action lists and removes the objects, then deletes the row. `remove` takes up to 1000 paths per call.
- **Row actions are one dropdown menu per row**, not two buttons: at 375 px one 44 px column fits next to Name and Projects.
- **"Delete" is never greyed out.** With blockers it opens an explanation dialog; without them, a confirmation.
- **The server stays the authority.** The page reads counts to choose the dialog; the action maps 23503 and detects an RLS no-op with `.select("id")`.
- **Project delete redirects from the action** to the Projects list. Returning `ok` would re-render the open page into a 404 before the client navigates.
- **Demo sandboxes**: both deletions are allowed. Upload slots and the AI budget are ledgers and are not refunded. Removing rows and objects together leaves the object cap room unchanged.

## Wording

Clients:

- Trigger `aria-label`: `Actions for {name}`. Menu items: `Rename`, `Delete`.
- Rename dialog: title `Rename client`, label `Client name`, submit `Save` / `Saving...`.
- Confirmation: title `Delete {name}?`; text `The client is removed from this workspace and can't be restored.`; with pending invitations add `{n} pending invitation will stop working.` / `{n} pending invitations will stop working.`; buttons `Cancel`, `Delete client` / `Deleting...`.
- Blocked: title `Can't delete {name}`, one paragraph per reason, button `Close`.
  - Projects: `{name} has 1 project. Delete it first, then delete the client.` / `{name} has {n} projects. Delete them first, then delete the client.` with a link `Open Projects` to `/w/{slug}/projects`.
  - People, viewer is owner: `1 person signs in as this client.` / `{n} people sign in as this client.` then `Remove them in Settings > Members first.` with a link `Open Members` to `/w/{slug}/settings/members`.
  - People, viewer is member: the same count sentence, then `Only a workspace owner can remove them in Settings > Members.` and no link.
- Action errors: 23503 `This client now has projects or people, so it can't be deleted. Reload the page to see what changed.`; delete no-op or other error `Could not delete this client`; rename no-op or other error `Could not rename this client`; validation uses the existing `clientNameSchema` messages.

Projects:

- Button: `Delete project` (outline, `Trash2` icon), in the project page header after the status control, staff only.
- Dialog title: `Delete this project?`
- Text: `This permanently deletes "{name}" and everything in it: {contents}. {clientName} will no longer see it. This cannot be undone.` `{contents}` reads like `3 updates, 5 comments and 2 files`, leaves out what the project does not have, and uses the singular for one. With nothing in it: `This permanently deletes "{name}". It has no updates, comments or files. This cannot be undone.`
- Field label: `Type the project name to confirm`, with the name shown below as helper text.
- Match rule: trim, collapse runs of whitespace to one space on both sides, then compare exactly, case-sensitive. The typed name is a guard in the UI and is not sent to the server.
- Buttons: `Cancel`, `Delete project` / `Deleting...`. Confirm is disabled until the name matches. While pending, the input and both buttons are disabled and the dialog cannot be dismissed.
- Errors, inline with `role="alert"`: `Project not found`; `Could not delete the project. Nothing was removed.`; `Some files were deleted, but the project was not. Try again.`

## Patterns to mirror

| Category            | Source                                                               | Pattern                                                                                                    |
| ------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Form dialog         | `src/app/w/[slug]/clients/new-client-dialog.tsx`                     | `Dialog`, `useActionState`, inline `role="alert"` error, label `Client name`                               |
| Destructive confirm | `src/app/w/[slug]/projects/[projectId]/confirm-delete-dialog.tsx:46` | `AlertDialog`, solid destructive button classes (the soft tint misses 4.5:1). Do not change this component |
| Focus restore       | `src/app/w/[slug]/projects/[projectId]/comment-row.tsx`              | `useTransition`, error state, focus back to the trigger on failure                                         |
| Row controls        | `src/app/w/[slug]/settings/members/member-row.tsx`                   | 44 px targets below `md` (`max-md:h-11`), inline error                                                     |
| RLS no-op check     | `src/app/w/[slug]/settings/members/actions.ts:138-171`               | `.select(...)` and `data.length === 0`                                                                     |
| File delete         | `src/app/w/[slug]/projects/[projectId]/actions.ts:328-365`           | `deleteFile`, `PROJECT_FILES_BUCKET`, `storage.remove`                                                     |
| Storage batches     | `src/lib/demo/cleanup.ts`                                            | batch size constant, failed batch handling                                                                 |
| Action tests        | `src/app/w/[slug]/projects/[projectId]/actions.test.ts`              | `chainResult`, `fromByTable`, `buildClient`                                                                |
| pgTAP               | `supabase/tests/02_clients_test.sql`, `03_projects_test.sql`         | `SET LOCAL ROLE`, JWT claims, fixture UUIDs, `plan(N)`                                                     |
| e2e                 | `e2e/support/workspace.ts`, `e2e/demo-limits.spec.ts:279`            | fresh signed-up workspace, database queries from a spec                                                    |

## Tasks

Tests come first in every task. Nothing touches the seeded projects "Client A Website Redesign" and "Client B Brand Refresh" or the seeded Acme clients, except read-only checks.

### Commit 1: `fix(ui): make the Sign out item span the account menu`

- `src/app/w/[slug]/nav-user.tsx:92`: add `w-full` to the item rendered as a `<button>`. Do not change `src/components/ui/dropdown-menu.tsx`.
- Test: in `e2e/ui-nits.spec.ts`, open the account menu and expect the Sign out item to be as wide as the "Light" item, within 1 px. Add a static markup class check in `nav-user.test.ts` only if the closed menu renders the item.

### Commit 2: `feat(db): cascade invitations when a client is deleted`

- Create `supabase/migrations/20261002100000_invitations_client_fk_cascade.sql`: drop and re-add `invitations_client_id_workspace_id_fkey` with `on delete cascade`. The header comment says why and that `projects` and `workspace_members` stay `no action` on purpose, and that a member's client delete removes invitation rows a member could not delete directly.
- `supabase/tests/02_clients_test.sql`, new cases: a member can rename a client; a name cannot be empty (23514); a name cannot exceed 100 characters (23514); a member can delete an empty client; a client user cannot delete their own client row; a non-member cannot delete a client; a client with projects cannot be deleted (23503); a client with people and no projects cannot be deleted (23503); a member deletes a client that only has invitations (one accepted, one pending) and the invitations go with it; a client can be deleted once its last project is deleted. Update `plan(N)`.
- Validate: `pnpm supabase db reset && pnpm db:test`, then `pnpm db:types` and an empty `git diff src/types/database.ts`.

### Commit 3: `test(db): cover project deletion in the projects access matrix`

- `supabase/tests/03_projects_test.sql`, `plan(12)` to `plan(19)`, deleting only projects the test inserts: a client cannot delete a project, even their own; a non-member cannot delete a project; a member can delete a project; the owner can delete a project that has updates, comments, files and draft requests; the deleted project is gone; its updates, comments, files and draft requests went with it (read under `RESET ROLE`); deleting a project leaves the other projects alone.
- These should pass without a migration. If one fails, stop and report.

### Commit 4: `feat(projects): delete a project with its updates and files`

- Create `src/app/w/[slug]/projects/[projectId]/project-delete-state.ts` and its test: `matchesProjectName(typed, name)` and `describeProjectContents({ updates, comments, files })`. Cases: matches the exact name; ignores leading and trailing spaces; treats runs of spaces as one; is case-sensitive; does not match an empty input; lists updates, comments and files with counts; uses the singular for one; leaves out what the project does not have; says the project is empty when all counts are zero.
- `deleteProject(workspaceId, workspaceSlug, projectId)` in `src/app/w/[slug]/projects/[projectId]/actions.ts`:
  1. Validate both ids as UUIDs before any query. They become a Storage prefix. Failure returns `Project not found`.
  2. `getClaims()`, read the caller's role in the workspace, and stop unless it is owner or member. Without this a client calling the action could remove their own objects before RLS refuses the row delete.
  3. Read the project with `.eq("id").eq("workspace_id")`; no row returns `Project not found`.
  4. List `{workspaceId}/{projectId}` page by page, then each file-id folder. The listing is the only source of paths to remove: it sees every object that exists, with or without a file row. A file row whose object is missing goes with the cascade and must not block the delete (corrected during implementation: a union with `project_files.storage_path` made such a project undeletable).
  5. Remove in batches. An `error`, or fewer objects returned than listed, is a failure.
  6. Delete the project row with `.select("id")`; no row returned is a failure.
  7. If step 5 or 6 fails after some objects are gone: delete the `project_files` rows whose objects were removed, revalidate the project page, return `Some files were deleted, but the project was not. Try again.` A retry lists again, so it finishes the job.
  8. A failure before any removal returns `Could not delete the project. Nothing was removed.` Every failure is logged with `console.error`.
  9. On success revalidate `/w/{slug}/projects`, `/w/{slug}` and `/w/{slug}/clients`, then `redirect("/w/{slug}/projects")` outside any try/catch.
- Unit tests in `actions.test.ts`: rejects ids that are not UUIDs before any query; rejects a signed-out caller; rejects a client without touching Storage; returns an error when the project is not found; removes every object under the project folder, including ones with no file row, before deleting the project; deletes a project with no files without calling remove; does not delete the project when listing the folder fails; does not delete the project when Storage removes fewer objects than asked; drops the file rows of objects already removed when a later batch fails; reports a failure when the delete affects no row; revalidates the projects list, the dashboard and the clients page, then redirects to the projects list.
- Create `delete-project-dialog.tsx` with the wording above. Initial focus on the input; Cancel returns focus to the button; closing clears the typed text and the error.
- `page.tsx`: three `select("id", { count: "exact", head: true })` counts for staff in the existing `Promise.all`, and the dialog in the header. `page.test.ts`: staff see Delete project; a client does not.
- Create `e2e/project-delete.spec.ts` on fresh workspaces: an owner deletes a project with an update, a comment and a file, and its Storage object is gone (confirm disabled for an empty and a wrong name; lands on Projects; the old URL is 404; no `storage.objects` rows under the prefix); an object with no file row is removed too; Cancel keeps the project and returns focus to the button; the dialog cannot be dismissed while deleting; a client does not see Delete project; a demo visitor deletes the template project in their own sandbox and the upload count stays the same. Add the open dialog to the axe run in both themes, to the 375 px checks and to `e2e/destructive-contrast.spec.ts`.

### Commit 5: `feat(clients): rename and delete clients`

- `src/app/w/[slug]/clients/actions.ts`: `renameClientCompany(workspaceId, workspaceSlug, clientId, formData)` and `deleteClientCompany(workspaceId, workspaceSlug, clientId)`, both scoped by client id and workspace id, with `.select("id")`. A rename revalidates the workspace layout so Projects, Members and the dashboard show the new name. Tests: renames the client and revalidates; trims the name; rejects an empty name without calling the database; rejects a name over 100 characters; scopes the update to the workspace and the client id; reports a failure when no row was updated; returns a generic error for a database failure; deletes the client and revalidates; maps a foreign key violation to the projects-or-people message; reports a failure when no row was deleted; returns a generic error for any other database failure; does not revalidate on a no-op.
- Create `client-delete-state.ts` and its test: `pendingInvitationCount(invitations, now)` (not accepted and not expired) and `clientDeleteBlockers({ name, projectCount, peopleCount, viewerRole })`. Cases: no blockers when both counts are zero; tells the user to delete the client's projects first; uses the singular for one project; links to the Projects page; people wording for an owner and for a member; both reasons in the order projects, people; the pending count ignores accepted and expired invitations; a pending invitation alone is not a blocker.
- Create `client-row-actions.tsx`, `rename-client-dialog.tsx`, `delete-client-dialog.tsx`. The trigger is a ghost icon button, 28 px on desktop and 44 px below `md`, with the icon hidden from assistive technology. The menu content overrides the anchor width (`w-auto min-w-32`, aligned to the end). After a successful delete, focus goes to the New client button (`id="new-client-trigger"` added in `new-client-dialog.tsx`).
- `page.tsx`: select `id, name, created_at, projects(count), workspace_members(count), invitations(accepted_at, expires_at)` and an actions column when `canManage`. `page.test.ts`: the new select string; staff get a menu named after each client; a member gets the same; a client-role viewer gets no actions column; the usage count still equals the number of clients.
- Create `e2e/client-manage.spec.ts` on a fresh workspace: renames a client and returns focus to its actions button; keeps the rename dialog open with an inline error for a blank name; deletes an empty client, frees the Free plan slot (2 / 2 with "Limit reached" becomes 1 / 2) and moves focus to New client; shows the empty state after the last client is deleted; a client with a project is blocked and links to Projects, and after its last project is deleted the client can be deleted; tells the owner where to remove people and tells a member to ask an owner (seeded Acme, read only). Add the open menu and the three dialogs to the axe run in both themes, to the 375 px and 44 px checks and to the contrast spec.

### Commit 6: `docs(readme): describe client and project deletion`

- What staff can rename and delete, that the rule is enforced by foreign keys, that deleting a client frees a Free slot at once, what deleting a project removes and in which order, and the residual risk below. New test lines in the tests list.

## Risks

| Risk                                                                                                   | Mitigation                                                                |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| A wrong Storage prefix removes another project's files                                                 | UUID validation and the project row lookup before listing; a unit test    |
| Storage removal fails halfway                                                                          | Step 7 keeps the file list true and a retry finishes                      |
| An object uploaded between listing and the row delete is orphaned                                      | Accepted and documented; same class as the known unregistered-upload risk |
| The hosted database lacks the migration when the code deploys                                          | `pnpm supabase db push` with a dry run before the merge                   |
| Focus is lost after deleting the last client, because the New client button moves into the empty state | An e2e assertion; fix in code if it fails                                 |

## Validation

```bash
pnpm lint && pnpm format:check && pnpm typecheck
pnpm test
pnpm supabase db reset && pnpm db:test
pnpm build
pnpm demo:blobs
pnpm test:e2e
```

Run without agent environment variables. Before Gate 2: screenshots in light and dark at 1440 and 375 of the account menu, the clients row menu, the rename dialog, the client delete confirmation, both blocked explanations, the project header and the project delete dialog (empty, matched, error).

## Acceptance

- [ ] An owner or member renames a client and sees the new name across the workspace
- [ ] An empty client can be deleted and a Free workspace gets its slot back
- [ ] A client with projects or people is not deleted, and the dialog says what to do
- [ ] A project is deleted with its updates, comments, file rows and Storage objects
- [ ] A client user cannot delete a client or a project (pgTAP and e2e)
- [ ] The Sign out item is as wide as the other menu items
- [ ] Validation passes locally and in CI
