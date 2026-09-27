-- Per Supabase's RLS performance guidance, a bare `auth.uid()` call in a
-- policy's USING/WITH CHECK is re-evaluated once per row; wrapping it as
-- `(select auth.uid())` lets Postgres evaluate it once per statement
-- instead. This asserts no policy in this schema regresses back to the
-- bare form. (A helper function's own body, like private.member_role, is
-- out of scope: the policy text that calls it never spells out
-- "auth.uid()" itself, so a plain substring search stays exact instead of
-- needing a parser.)
--
-- A policy is flagged when its occurrence count of `auth.uid()` doesn't
-- match its occurrence count of `select auth.uid()`: every bare call must
-- have a matching wrapped one, and none may be left unwrapped. A plain
-- "does this contain an unwrapped call" regex passes a policy that mixes
-- both forms (`user_id = auth.uid() or user_id = (select auth.uid())`),
-- since the wrapped occurrence alone satisfies it; counting both forms
-- catches that case too. Postgres stores the wrapped form as
-- `( SELECT auth.uid() AS uid)`, so the pattern below matches on
-- `select\s+auth\.uid\(\)` case-insensitively rather than the literal
-- lowercase source text.
BEGIN;
SELECT plan(2);

SELECT is(
  (
    SELECT count(*)::int
    FROM pg_policies
    WHERE schemaname in ('public', 'storage')
      AND (
        coalesce(regexp_count(qual, 'auth\.uid\(\)', 1, 'i'), 0)
          <> coalesce(regexp_count(qual, 'select\s+auth\.uid\(\)', 1, 'i'), 0)
        OR coalesce(regexp_count(with_check, 'auth\.uid\(\)', 1, 'i'), 0)
          <> coalesce(regexp_count(with_check, 'select\s+auth\.uid\(\)', 1, 'i'), 0)
      )
  ),
  0,
  'no RLS policy calls auth.uid() without wrapping it in (select auth.uid())'
);

-- Regression check: a policy that mixes a bare and a wrapped auth.uid()
-- call in the same expression must still be flagged. A throwaway policy on
-- a real table proves it; the enclosing transaction's ROLLBACK drops it.
create policy ai_draft_requests_mixed_auth_uid_check on public.ai_draft_requests
  for select to authenticated
  using (user_id = auth.uid() or user_id = (select auth.uid()));

SELECT is(
  (
    SELECT count(*)::int
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname = 'ai_draft_requests_mixed_auth_uid_check'
      AND (
        coalesce(regexp_count(qual, 'auth\.uid\(\)', 1, 'i'), 0)
          <> coalesce(regexp_count(qual, 'select\s+auth\.uid\(\)', 1, 'i'), 0)
        OR coalesce(regexp_count(with_check, 'auth\.uid\(\)', 1, 'i'), 0)
          <> coalesce(regexp_count(with_check, 'select\s+auth\.uid\(\)', 1, 'i'), 0)
      )
  ),
  1,
  'a policy mixing a bare and a wrapped auth.uid() call is flagged'
);

SELECT * FROM finish();
ROLLBACK;
