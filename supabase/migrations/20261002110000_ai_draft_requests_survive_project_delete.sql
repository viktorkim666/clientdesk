-- Deleting a project must not hand back AI draft quota. claim_ai_draft counts
-- ai_draft_requests rows (10 per user per hour, 50 per workspace per 24
-- hours), and the foreign key to projects cascaded, so deleting a project
-- erased its rows from those counts. Now only the project reference is
-- cleared: the row keeps its workspace_id and user_id, which is all the
-- limits read. The cleanup job that removes rows older than 7 days and the
-- select policy (user_id = auth.uid()) do not use project_id, so they are
-- unaffected.
--
-- `on delete set null (project_id)` with a column list needs PostgreSQL 15 or
-- later. Without the list, the delete would also try to null workspace_id,
-- which is not nullable. The key is (project_id, workspace_id) with the
-- default MATCH SIMPLE: a row whose project_id is null is not checked against
-- projects, and workspace_id keeps its own foreign key to workspaces, so a
-- deleted workspace still takes its rows with it.

alter table public.ai_draft_requests
  alter column project_id drop not null;

alter table public.ai_draft_requests
  drop constraint ai_draft_requests_project_id_workspace_id_fkey;

alter table public.ai_draft_requests
  add constraint ai_draft_requests_project_id_workspace_id_fkey
  foreign key (project_id, workspace_id)
  references public.projects (id, workspace_id)
  on delete set null (project_id);
