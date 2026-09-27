-- Deleting a user who created content (a workspace, an invitation, a
-- project update, a comment or a file) currently fails, because those
-- foreign keys to auth.users have no ON DELETE rule. Per product decision,
-- the content stays and the column naming its author goes to NULL; the app
-- shows "Former member" for a null author.
--
-- ai_draft_requests.user_id keeps ON DELETE CASCADE (not touched here):
-- those rows are only rate-limit counters, not user-facing content, so
-- there's nothing worth keeping once the user who spent the requests is
-- gone.

alter table public.workspaces
  alter column created_by drop not null;

alter table public.workspaces
  drop constraint workspaces_created_by_fkey,
  add constraint workspaces_created_by_fkey
    foreign key (created_by) references auth.users (id) on delete set null;

alter table public.invitations
  alter column invited_by drop not null;

alter table public.invitations
  drop constraint invitations_invited_by_fkey,
  add constraint invitations_invited_by_fkey
    foreign key (invited_by) references auth.users (id) on delete set null;

alter table public.project_updates
  alter column author_id drop not null;

alter table public.project_updates
  drop constraint project_updates_author_id_fkey,
  add constraint project_updates_author_id_fkey
    foreign key (author_id) references auth.users (id) on delete set null;

alter table public.update_comments
  alter column author_id drop not null;

alter table public.update_comments
  drop constraint update_comments_author_id_fkey,
  add constraint update_comments_author_id_fkey
    foreign key (author_id) references auth.users (id) on delete set null;

alter table public.project_files
  alter column uploaded_by drop not null;

alter table public.project_files
  drop constraint project_files_uploaded_by_fkey,
  add constraint project_files_uploaded_by_fkey
    foreign key (uploaded_by) references auth.users (id) on delete set null;
