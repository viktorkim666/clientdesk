-- Deleting a client fails for good once it has an invitation row, because
-- the foreign key from invitations to clients has no ON DELETE rule. An
-- accepted or expired invitation never goes away by itself, and only a
-- workspace owner may delete invitations, so a member could never free a
-- client that was ever invited to.
--
-- The invitation belongs to the client, so it now goes with it. A member who
-- deletes a client therefore removes invitation rows that a member could not
-- delete directly; that is intended, the client is the thing being removed.
--
-- projects and workspace_members keep their no-action foreign keys to
-- clients on purpose: a client with projects or people must still be
-- refused by the database (23503), not only by the app.

alter table public.invitations
  drop constraint invitations_client_id_workspace_id_fkey,
  add constraint invitations_client_id_workspace_id_fkey
    foreign key (client_id, workspace_id)
    references public.clients (id, workspace_id) on delete cascade;

-- Nothing indexed invitations.client_id, so the cascade above scanned the
-- whole table for every client delete, and so did the clients page, which
-- embeds each client's invitations.
create index invitations_client_id_idx on public.invitations (client_id);
