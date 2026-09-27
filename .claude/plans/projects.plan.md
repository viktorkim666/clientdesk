# Plan: Projects

**Source PRD**: `.claude/prds/clientdesk.prd.md`
**Selected Milestone**: 2. Projects
**Complexity**: Large

## Summary

Add a project page where staff post updates and change the status, both sides share files, and the client comments on updates and gets an email for each new update. Files live in a private Supabase Storage bucket, and the same RLS model as milestone 1 guards both the tables and the stored objects. The milestone is done when a client can open their project, download a file the agency shared, comment on an update and receive its email, while another client still gets a 404 for the same URL.

## Decisions

- **Updates and comments.** Only staff (owner, member) post updates. Staff and the project's client comment on updates. Comments are flat, one level under an update. Bodies are plain text, rendered with line breaks and never as HTML.
- **Files.** Staff and the project's client can upload. The uploader or any staff member can delete. Downloads go through short-lived signed URLs (60 seconds) created on the server.
- **Upload limits** (PRD open question, resolved for this milestone): 10 MiB per file. Allowed types: PDF, PNG, JPEG, WebP, GIF, plain text, CSV, ZIP, and Word, Excel and PowerPoint (OOXML). SVG and HTML are excluded because they can carry scripts. The limits are enforced three times: bucket settings, a Zod schema in the app, and the UI. Per-workspace storage quotas belong to billing (milestone 3); demo abuse limits belong to milestone 5.
- **Upload path.** The browser uploads straight to Storage with the user's session, so large files never pass through a server action (Next.js limits action bodies to 1 MB by default). The object path is `{workspace_id}/{project_id}/{file_id}/{safe_name}`, and Storage RLS checks the workspace and project segments. After the upload, a server action verifies the object exists and records its metadata. If that second step fails, the UI deletes the object.
- **Email.** Posting an update emails every client user of that project's client. A failed email does not undo the update: the update is saved and the form reports that the email could not be sent. Recipient emails come from a `security definer` RPC that only staff of that workspace can call, because `auth.users` is not readable through RLS.

## Patterns to Mirror

| Category             | Source                                                                              | Pattern                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Server actions       | `src/app/w/[slug]/projects/actions.ts:10-40`                                        | `"use server"`, Zod `safeParse` on `FormData`, `{ ok: true } \| { ok: false; error }`, generic user-facing error, `revalidatePath`               |
| Workspace access     | `src/lib/workspace/current.ts:24-60`                                                | `getCurrentWorkspace` resolves the membership; query errors throw, a missing row calls `notFound()`                                              |
| RLS helpers          | `supabase/migrations/20260926174327_init.sql:88-128, 208-230`                       | policies call `security definer` helpers in `private` with `search_path = ''`; never query the policy's own table                                |
| RLS relies, UI hides | `src/app/w/[slug]/projects/page.tsx:22-40`                                          | queries rely on RLS for scoping; the UI only hides staff controls                                                                                |
| Email                | `src/lib/email/types.ts`, `index.ts`, `resend-sender.ts`                            | `EmailSender` interface; console sender writes `.local/emails.jsonl`; Resend when `RESEND_API_KEY` is set; HTML values escaped with `escapeHtml` |
| pgTAP                | `supabase/tests/03_projects_test.sql`                                               | seeded fixed UUIDs, `SET LOCAL ROLE authenticated` + `request.jwt.claims`, one file per table, attack cases named in the description             |
| E2E                  | `e2e/roles.spec.ts`, `e2e/support/emails.ts`                                        | full flow against local Supabase; read emails from `.local/emails.jsonl` by recipient                                                            |
| Unit tests           | `src/lib/validation/*.test.ts`, `src/app/w/[slug]/settings/members/actions.test.ts` | Vitest next to the code; actions tested with a mocked Supabase client and sender                                                                 |

## Data model

- `project_updates`: `id`, `workspace_id`, `project_id`, `author_id`, `body` (1 to 5,000 chars), `created_at`. Composite FK `(project_id, workspace_id)` to `projects`.
- `update_comments`: `id`, `workspace_id`, `project_id`, `update_id`, `author_id`, `body` (1 to 2,000 chars), `created_at`.
- `project_files`: `id`, `workspace_id`, `project_id`, `uploaded_by`, `storage_path` (unique), `name`, `size_bytes`, `mime_type`, `created_at`.
- Private bucket `project-files` with `file_size_limit` 10 MiB and the MIME allowlist. It is declared in `supabase/config.toml` for local work and created by a migration so hosted projects get it too.
- Helpers in `private`: `can_read_project(project_id)` (staff of the workspace, or a client member whose `client_id` matches the project's client) and `is_staff(workspace_id)`.
- RPC `project_update_recipients(project_id)`: returns client users' emails; raises unless the caller is staff of the project's workspace.

| Table / object                     | owner, member                              | project's client                                    | other client, non-member |
| ---------------------------------- | ------------------------------------------ | --------------------------------------------------- | ------------------------ |
| project_updates                    | read, insert, delete                       | read                                                | nothing                  |
| update_comments                    | read, insert; delete own                   | read, insert; delete own                            | nothing                  |
| project_files                      | read, insert, delete any                   | read, insert; delete own                            | nothing                  |
| storage objects in `project-files` | read, upload, delete under their workspace | read and upload under their own project; delete own | nothing                  |

Indexes: `project_updates (project_id, created_at desc)`, `update_comments (update_id, created_at)`, `project_files (project_id, created_at desc)`, plus `workspace_id` on each table for RLS.

## Files to Change

| File                                                                                                                                                                     | Action          | Why                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------------------------ |
| `supabase/migrations/*_projects_content.sql`                                                                                                                             | CREATE          | tables, indexes, helpers, RLS, bucket, storage policies, recipients RPC                                      |
| `supabase/config.toml`                                                                                                                                                   | UPDATE          | declare the `project-files` bucket locally (protected file: the user pastes the block)                       |
| `supabase/seed.sql`                                                                                                                                                      | UPDATE          | one update with a comment, and one file row per seeded project                                               |
| `supabase/tests/07_project_updates_test.sql`, `08_update_comments_test.sql`, `09_project_files_test.sql`, `10_storage_objects_test.sql`, `11_update_recipients_test.sql` | CREATE          | access matrix and attack cases                                                                               |
| `src/types/database.ts`                                                                                                                                                  | UPDATE          | regenerated                                                                                                  |
| `src/lib/validation/update.ts`, `comment.ts`, `file.ts` (+ tests)                                                                                                        | CREATE          | body limits, file size and MIME allowlist, safe file names                                                   |
| `src/lib/files/storage-path.ts` (+ test)                                                                                                                                 | CREATE          | build and parse `{workspace}/{project}/{file}/{name}`                                                        |
| `src/lib/email/types.ts`, `console-sender.ts`, `resend-sender.ts`, `index.ts` (+ tests)                                                                                  | UPDATE          | `sendProjectUpdateEmail`                                                                                     |
| `src/app/w/[slug]/projects/[projectId]/page.tsx`, `loading.tsx`                                                                                                          | CREATE          | project page: header, status, updates feed, files                                                            |
| `src/app/w/[slug]/projects/[projectId]/actions.ts` (+ test)                                                                                                              | CREATE          | `postUpdate`, `postComment`, `deleteComment`, `changeStatus`, `registerFile`, `deleteFile`, `getDownloadUrl` |
| `src/app/w/[slug]/projects/[projectId]/*.tsx`                                                                                                                            | CREATE          | update form, update list with comments, file uploader, file list                                             |
| `src/app/w/[slug]/projects/page.tsx`                                                                                                                                     | UPDATE          | project names link to the project page                                                                       |
| `e2e/projects.spec.ts`, `e2e/support/emails.ts`                                                                                                                          | CREATE / UPDATE | full flow; read update emails too                                                                            |

## Tasks

### Task 1: Schema and RLS, tests first

- **Action**: write the pgTAP files for the matrix above, then the migration. Attack cases: client B reading client A's updates, comments, files and storage objects; a client posting an update; a client deleting someone else's comment or file; a client uploading into another project's path; a malformed storage path (not a UUID) must be denied, not raise; a non-staff caller of the recipients RPC.
- **Mirror**: init migration helper and policy style; pgTAP seeded UUIDs.
- **Validate**: `pnpm supabase db reset && pnpm supabase test db`; each new file fails before the policies exist and passes after.

### Task 2: Bucket configuration

- **Action**: migration inserts the bucket with limits (idempotent); `config.toml` block prepared for the user to paste.
- **Validate**: pgTAP asserts the bucket row, its size limit and MIME list.

### Task 3: Validation and path helpers

- **Action**: Zod schemas for update, comment and file metadata; safe-name function (strip path separators and control characters, keep the extension, cap length); path builder and parser.
- **Validate**: `pnpm test` with cases for `../` names, oversize files, disallowed MIME types, empty and too-long bodies.

### Task 4: Project page and status

- **Action**: `/w/[slug]/projects/[projectId]` using `getCurrentWorkspace`; a missing or foreign project calls `notFound()`; staff change the status inline; list page links to it.
- **Validate**: e2e: client B opening client A's project URL gets 404.

### Task 5: Updates, comments, email

- **Action**: `postUpdate` inserts, then fetches recipients through the RPC and sends one email per recipient through `EmailSender`; email failures are logged and reported without undoing the update. `postComment` and `deleteComment`. Feed shows the latest 50 updates with their comments.
- **Mirror**: members actions for the send-and-handle-failure pattern.
- **Validate**: action unit tests with a failing sender; e2e reads the update email for the client user.

### Task 6: Files

- **Action**: uploader validates size and type in the browser, uploads with the browser Supabase client to the computed path, then calls `registerFile`, which re-validates, checks the object exists and inserts metadata; on failure the client deletes the object. `getDownloadUrl` returns a 60-second signed URL. `deleteFile` removes the row and the object.
- **Validate**: unit tests for `registerFile` rejections; e2e uploads a PDF as staff and downloads it as the client.

### Task 7: End-to-end flow and review

- **Action**: `e2e/projects.spec.ts`: staff posts an update and uploads a file; client A sees both, downloads the file, comments, and has an email; client B gets 404 on the same URL.
- **Validate**: full validation below, then review by security, database, React and TypeScript reviewers.

## Validation

```bash
pnpm check
pnpm test
pnpm supabase db reset
pnpm supabase test db
pnpm test:e2e
pnpm build
```

## Risks

| Risk                                                              | Likelihood | Mitigation                                                                  |
| ----------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| Storage policies leak files across clients                        | Medium     | pgTAP on `storage.objects` for every role, including malformed paths        |
| A non-UUID path segment makes a policy cast raise instead of deny | Medium     | helpers validate the segment before casting; a test covers it               |
| Orphaned objects when metadata registration fails                 | Medium     | the client deletes the object on failure; a periodic cleanup can come later |
| `config.toml` is protected by the config hook                     | High       | the user pastes the bucket block; the migration also creates the bucket     |
| Signed URLs shared outside the app                                | Low        | 60-second expiry; created only after an RLS-checked read                    |
| Email volume per update with many client users                    | Low        | small agencies have few client users; batching can come later               |

## Acceptance

- [ ] All tasks complete
- [ ] Validation passes locally and in CI
- [ ] pgTAP covers every cell of the matrix and the listed attack cases
- [ ] A client downloads a shared file, comments, and receives the update email; another client gets 404
- [ ] Every route follows the patterns above
