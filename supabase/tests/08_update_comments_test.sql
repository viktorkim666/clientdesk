-- Access matrix for public.update_comments, including the attack cases:
-- client B reading client A's comments, a client posting on someone else's
-- project, and a client deleting someone else's comment.
BEGIN;
SELECT plan(12);

SELECT has_index(
  'public', 'update_comments', 'update_comments_project_id_idx',
  'update_comments has an index leading with project_id for the project page''s comment lookups'
);

-- workspace: a0000000-0000-0000-0000-000000000001
-- project A (client A): d0000000-0000-0000-0000-00000000000a
-- project B (client B): d0000000-0000-0000-0000-00000000000b
-- update on project A: e0000000-0000-0000-0000-00000000000a
-- update on project B: e0000000-0000-0000-0000-00000000000b
-- comment by client A on update A: f0000000-0000-0000-0000-00000000000a
-- comment by owner on update A:    f0000000-0000-0000-0000-00000000000c
-- owner:     00000001-0000-0000-0000-000000000001
-- member:    00000002-0000-0000-0000-000000000002
-- client A user: 0000000a-0000-0000-0000-00000000000a
-- client B user: 0000000b-0000-0000-0000-00000000000b
-- outsider:  00000009-0000-0000-0000-000000000009

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.update_comments),
  2,
  'the owner reads every comment'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000002-0000-0000-0000-000000000002","email":"member@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.update_comments),
  2,
  'a member reads every comment'
);

SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.update_comments),
  2,
  'client A reads every comment on their own project'
);

-- Attack: client B reading client A's comments.
SET LOCAL request.jwt.claims TO '{"sub":"0000000b-0000-0000-0000-00000000000b","email":"client-b@clientdesk.test","role":"authenticated"}';
SELECT is_empty(
  $$ select 1 from public.update_comments $$,
  'client B reads no comments on client A''s project'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000009-0000-0000-0000-000000000009","email":"outsider@clientdesk.test","role":"authenticated"}';
SELECT is_empty(
  $$ select 1 from public.update_comments $$,
  'a non-member reads no comments'
);

-- Insert: the project's client and staff can both comment on an update.
SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ insert into public.update_comments (workspace_id, project_id, update_id, author_id, body)
       values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a',
               'e0000000-0000-0000-0000-00000000000a', '0000000a-0000-0000-0000-00000000000a',
               'A second comment from client A') $$,
  'client A can comment on their own project''s update'
);

SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
SELECT lives_ok(
  $$ insert into public.update_comments (workspace_id, project_id, update_id, author_id, body)
       values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000a',
               'e0000000-0000-0000-0000-00000000000a', '00000001-0000-0000-0000-000000000001',
               'A second comment from the owner') $$,
  'the owner can comment on an update'
);

-- Attack: client A cannot comment on client B's update.
SET LOCAL request.jwt.claims TO '{"sub":"0000000a-0000-0000-0000-00000000000a","email":"client-a@clientdesk.test","role":"authenticated"}';
SELECT throws_ok(
  $$ insert into public.update_comments (workspace_id, project_id, update_id, author_id, body)
       values ('a0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-00000000000b',
               'e0000000-0000-0000-0000-00000000000b', '0000000a-0000-0000-0000-00000000000a',
               'Sneaky comment on client B''s update') $$,
  'new row violates row-level security policy for table "update_comments"',
  'client A cannot comment on client B''s update'
);

-- Attack: a client cannot delete someone else's comment.
DELETE FROM public.update_comments WHERE id = 'f0000000-0000-0000-0000-00000000000c';
SELECT isnt_empty(
  $$ select 1 from public.update_comments where id = 'f0000000-0000-0000-0000-00000000000c' $$,
  'client A cannot delete the owner''s comment'
);

-- A client can delete their own comment.
DELETE FROM public.update_comments WHERE id = 'f0000000-0000-0000-0000-00000000000a';
SELECT is_empty(
  $$ select 1 from public.update_comments where id = 'f0000000-0000-0000-0000-00000000000a' $$,
  'client A can delete their own comment'
);

-- Staff can delete their own comment too.
SET LOCAL request.jwt.claims TO '{"sub":"00000001-0000-0000-0000-000000000001","email":"owner@clientdesk.test","role":"authenticated"}';
DELETE FROM public.update_comments WHERE id = 'f0000000-0000-0000-0000-00000000000c';
SELECT is_empty(
  $$ select 1 from public.update_comments where id = 'f0000000-0000-0000-0000-00000000000c' $$,
  'the owner can delete their own comment'
);

SELECT * FROM finish();
ROLLBACK;
