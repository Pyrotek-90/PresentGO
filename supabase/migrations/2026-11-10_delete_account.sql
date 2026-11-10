-- StaffList: Settings → Delete my account (Apple requires in-app account deletion). Safe to run again.
--
-- What happens to each team the person is on:
--   delete   only they have an account on it: the team and everything in it are deleted
--   handover they are its only Admin and others have accounts: Admin passes to a Leader
--            (else the longest-standing member); what they added stays with the team
--   leave    someone else is already an Admin: they leave; what they added stays with the team
-- Songs, sets and files are tied to the person who added them and would otherwise be deleted with
-- the account, so on teams that stay they are handed to an Admin first.

begin;

-- Who takes over a team's rows when this person goes (null = nobody else has an account on it).
create or replace function public.sl_team_heir(c uuid, me uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select user_id from public.church_members
      where church_id = c and user_id <> me and role = 'admin' order by created_at limit 1),
    (select l.user_id from public.workspace_leaders l join public.workspaces w on w.id = l.workspace_id
       join public.church_members cm on cm.church_id = c and cm.user_id = l.user_id
      where w.church_id = c and l.user_id <> me order by l.created_at limit 1),
    (select user_id from public.church_members
      where church_id = c and user_id <> me order by created_at limit 1))
$$;
revoke execute on function public.sl_team_heir(uuid, uuid) from public, anon, authenticated;

-- What deleting my account would do, for the confirmation screen.
create or replace function public.account_deletion_preview() returns jsonb
language sql stable security definer set search_path = public as $$
  with mine as (
    select c.id, c.name, cm.role,
           exists (select 1 from public.church_members o where o.church_id = c.id and o.user_id <> auth.uid() and o.role = 'admin') as other_admin,
           public.sl_team_heir(c.id, auth.uid()) as heir
      from public.church_members cm join public.churches c on c.id = cm.church_id
     where cm.user_id = auth.uid()
  )
  select jsonb_build_object(
    'email', (select email from auth.users where id = auth.uid()),
    'teams', coalesce(jsonb_agg(jsonb_build_object(
       'id', m.id, 'name', m.name,
       'action', case when m.heir is null then 'delete'
                      when m.role = 'admin' and not m.other_admin then 'handover'
                      else 'leave' end,
       'heir', (select coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1))
                  from auth.users u where u.id = m.heir))
       order by m.name), '[]'::jsonb),
    -- Files to remove from storage first: everything in the teams being deleted, plus anything not in a team.
    'files', coalesce((
       select jsonb_agg(p) from (
         select mi.storage_path as p from public.media_items mi
          where mi.user_id = auth.uid() and mi.storage_path is not null
            and (mi.church_id is null or mi.church_id in (select id from mine where heir is null))
         union
         select im->>'storage_path' from public.media_items mi, jsonb_array_elements(coalesce(mi.metadata->'images', '[]'::jsonb)) im
          where mi.user_id = auth.uid() and im->>'storage_path' is not null
            and (mi.church_id is null or mi.church_id in (select id from mine where heir is null))
       ) f), '[]'::jsonb))
  from mine m
$$;
grant execute on function public.account_deletion_preview() to authenticated;

-- Deletes the signed-in person's account. p_confirm must be 'DELETE'.
create or replace function public.delete_my_account(p_confirm text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  t record;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if p_confirm is distinct from 'DELETE' then raise exception 'Type DELETE to confirm'; end if;

  for t in
    select cm.church_id as id, cm.role,
           exists (select 1 from public.church_members o where o.church_id = cm.church_id and o.user_id <> me and o.role = 'admin') as other_admin,
           public.sl_team_heir(cm.church_id, me) as heir
      from public.church_members cm where cm.user_id = me
  loop
    if t.heir is null then
      delete from public.churches where id = t.id;               -- the team and everything in it
    else
      if t.role = 'admin' and not t.other_admin then
        update public.church_members set role = 'admin' where church_id = t.id and user_id = t.heir;
      end if;
      update public.songs         set user_id = t.heir where church_id = t.id and user_id = me;
      update public.sets          set user_id = t.heir where church_id = t.id and user_id = me;
      update public.positions     set user_id = t.heir where church_id = t.id and user_id = me;
      update public.team_members  set user_id = t.heir where church_id = t.id and user_id = me;
      update public.media_items   set user_id = t.heir where church_id = t.id and user_id = me;
      update public.media_folders set user_id = t.heir where church_id = t.id and user_id = me;
    end if;
  end loop;

  -- Everything else that is theirs (memberships, notifications, calendar links, rows not in a team)
  -- goes with the account.
  delete from auth.users where id = me;
  return true;
end $$;
revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;

commit;
