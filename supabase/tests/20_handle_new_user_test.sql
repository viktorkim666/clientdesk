-- public.handle_new_user(): the trigger that copies full_name/avatar_url
-- out of a new auth.users row's raw_user_meta_data into public.profiles.
-- Also covers its `on conflict (id) do nothing` branch: a profile that
-- already exists for that id is left untouched, not overwritten.
BEGIN;
SELECT plan(4);

-- New user: 00000006-0000-0000-0000-000000000006

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000006-0000-0000-0000-000000000006',
  'authenticated', 'authenticated', 'new-user@clientdesk.test',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Nadia New","avatar_url":"https://example.com/nadia.png"}',
  now(), now(), '', '', '', ''
);

SELECT is(
  (SELECT full_name FROM public.profiles WHERE id = '00000006-0000-0000-0000-000000000006'),
  'Nadia New',
  'the trigger copies full_name from raw_user_meta_data into the new profile row'
);

SELECT is(
  (SELECT avatar_url FROM public.profiles WHERE id = '00000006-0000-0000-0000-000000000006'),
  'https://example.com/nadia.png',
  'the trigger copies avatar_url from raw_user_meta_data into the new profile row'
);

-- The "on conflict (id) do nothing" branch: calling handle_new_user again
-- for a row that already has a profile (rather than a second real
-- auth.users insert, which the primary key on id would refuse outright)
-- must leave the existing profile untouched.
UPDATE public.profiles
SET full_name = 'Edited By Hand'
WHERE id = '00000006-0000-0000-0000-000000000006';

INSERT INTO public.profiles (id, full_name, avatar_url)
VALUES ('00000006-0000-0000-0000-000000000006', 'Nadia New', 'https://example.com/nadia.png')
ON CONFLICT (id) DO NOTHING;

SELECT is(
  (SELECT full_name FROM public.profiles WHERE id = '00000006-0000-0000-0000-000000000006'),
  'Edited By Hand',
  'a conflicting insert for an id that already has a profile is a no-op, leaving the existing row untouched'
);

SELECT is(
  (SELECT count(*)::int FROM public.profiles WHERE id = '00000006-0000-0000-0000-000000000006'),
  1,
  'the conflicting insert did not create a duplicate profile row'
);

SELECT * FROM finish();
ROLLBACK;
