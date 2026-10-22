-- StaffList: churches and workspaces — shared team access.
-- Run once in Supabase → SQL Editor (safe to run again).
--
--  • A church owns one song library, one team roster and one content library.
--  • A church has workspaces (Main Service, Youth, Kids, Women's Fellowship…); each set belongs to one.
--    Free / Pro: 1 workspace. Ultimate: up to 5.
--  • Roles:  Admin  — the whole church: every workspace, songs, team, people and roles.
--            Leader — of one or more workspaces: builds their sets, schedules the team, edits songs.
--            Member — musicians and singers: see the sets they've accepted, with those songs' charts.
--  • Everyone who already uses StaffList gets a church (with a "Main Service" workspace) holding all
--    of their songs, sets, team and content, with themselves as Admin. Nothing is deleted.
--  • People join a church automatically when they sign in with an email that's on its team roster.

-- ─── 1. Tables ───────────────────────────────────────────────────────────────────────────────

create table if not exists public.churches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  plan       text not null default 'free' check (plan in ('free', 'pro', 'ultimate')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  church_id  uuid not null references public.churches(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index if not exists workspaces_church_idx on public.workspaces (church_id);

create table if not exists public.church_members (
  church_id  uuid not null references public.churches(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (church_id, user_id)
);
create index if not exists church_members_user_idx on public.church_members (user_id);

create table if not exists public.workspace_leaders (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_leaders_user_idx on public.workspace_leaders (user_id);

-- ─── 2. Church / workspace on existing tables ───────────────────────────────────────────────
-- user_id stays on every row as "created by".

alter table public.songs         add column if not exists church_id    uuid references public.churches(id) on delete cascade;
alter table public.sets          add column if not exists church_id    uuid references public.churches(id) on delete cascade;
alter table public.sets          add column if not exists workspace_id uuid references public.workspaces(id) on delete cascade;
alter table public.positions     add column if not exists church_id    uuid references public.churches(id) on delete cascade;
alter table public.team_members  add column if not exists church_id    uuid references public.churches(id) on delete cascade;
alter table public.media_items   add column if not exists church_id    uuid references public.churches(id) on delete cascade;
alter table public.media_folders add column if not exists church_id    uuid references public.churches(id) on delete cascade;

create index if not exists songs_church_idx         on public.songs (church_id);
create index if not exists sets_church_idx          on public.sets (church_id);
create index if not exists sets_workspace_idx       on public.sets (workspace_id);
create index if not exists positions_church_idx     on public.positions (church_id);
create index if not exists team_members_church_idx  on public.team_members (church_id);
create index if not exists team_members_email_idx   on public.team_members (lower(email));
create index if not exists media_items_church_idx   on public.media_items (church_id);
create index if not exists media_folders_church_idx on public.media_folders (church_id);
create index if not exists set_items_song_idx       on public.set_items ((content->>'song_id'));
create index if not exists set_assignments_set_idx  on public.set_assignments (set_id);

-- ─── 3. Access checks (used by the rules below; they run with full rights so they never loop) ──

create or replace function public.sl_email(u uuid) returns text
language sql stable security definer set search_path = public as $$
  select lower(email) from auth.users where id = u
$$;

create or replace function public.sl_is_member(c uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.church_members where church_id = c and user_id = u)
$$;

create or replace function public.sl_is_admin(c uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.church_members where church_id = c and user_id = u and role = 'admin')
$$;

-- Admin, or Leader of any workspace in the church: can edit songs, team and content.
create or replace function public.sl_is_editor(c uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select public.sl_is_admin(c, u) or exists (
    select 1 from public.workspace_leaders l join public.workspaces w on w.id = l.workspace_id
     where w.church_id = c and l.user_id = u)
$$;

-- Can build and change sets in this workspace: Admin of the church or Leader of the workspace.
create or replace function public.sl_can_edit(c uuid, w uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select public.sl_is_admin(c, u)
      or (w is not null and exists (select 1 from public.workspace_leaders where workspace_id = w and user_id = u))
$$;

-- Accepted a spot on this set (matched by the email on their team record).
create or replace function public.sl_is_scheduled(s uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.set_assignments a join public.team_members m on m.id = a.member_id
     where a.set_id = s and a.status = 'accepted' and m.email is not null
       and lower(m.email) = public.sl_email(u))
$$;

create or replace function public.sl_can_edit_set(s uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.sets x where x.id = s and public.sl_can_edit(x.church_id, x.workspace_id, u))
$$;

create or replace function public.sl_can_view_set(s uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select public.sl_can_edit_set(s, u) or public.sl_is_scheduled(s, u)
$$;

-- A song in a set this person has accepted.
create or replace function public.sl_song_in_my_sets(song uuid, u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.set_items si
     where si.content->>'song_id' = song::text and public.sl_is_scheduled(si.set_id, u))
$$;

-- The church a new song / set / team record goes into when the app doesn't say:
-- the first church this person can edit.
create or replace function public.sl_default_church(u uuid default auth.uid()) returns uuid
language sql stable security definer set search_path = public as $$
  select church_id from public.church_members
   where user_id = u
   order by public.sl_is_editor(church_id, u) desc, (role = 'admin') desc, created_at
   limit 1
$$;

create or replace function public.sl_fill_church() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.church_id is null then new.church_id := public.sl_default_church(); end if;
  if tg_table_name = 'sets' then
    if new.workspace_id is null and new.church_id is not null then
      select w.id into new.workspace_id from public.workspaces w
       where w.church_id = new.church_id and public.sl_can_edit(w.church_id, w.id)
       order by w.created_at limit 1;
    end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['songs', 'sets', 'positions', 'team_members', 'media_items', 'media_folders'] loop
    execute format('drop trigger if exists sl_fill_church on public.%I', t);
    execute format('create trigger sl_fill_church before insert on public.%I for each row execute function public.sl_fill_church()', t);
  end loop;
end $$;

-- ─── 4. Move everyone's existing data into their own church ─────────────────────────────────

do $$
declare
  o uuid; c uuid; w uuid;
begin
  for o in
    select distinct owner from (
      select user_id as owner from public.songs         where church_id is null
      union select user_id from public.sets          where church_id is null
      union select user_id from public.positions     where church_id is null
      union select user_id from public.team_members  where church_id is null
      union select user_id from public.media_items   where church_id is null
      union select user_id from public.media_folders where church_id is null
    ) x where owner is not null
  loop
    c := null; w := null;
    select cm.church_id into c from public.church_members cm
     where cm.user_id = o and cm.role = 'admin' order by cm.created_at limit 1;
    if c is null then
      insert into public.churches (name, plan, created_by)
      select coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), '') || '''s Church', 'My Church'), 'pro', o
        from auth.users u where u.id = o
      returning id into c;
      if c is null then continue; end if;   -- no such user any more
      insert into public.church_members (church_id, user_id, role) values (c, o, 'admin') on conflict do nothing;
    end if;
    select id into w from public.workspaces where church_id = c order by created_at limit 1;
    if w is null then
      insert into public.workspaces (church_id, name) values (c, 'Main Service') returning id into w;
    end if;
    update public.songs         set church_id = c where user_id = o and church_id is null;
    update public.sets          set church_id = c, workspace_id = coalesce(workspace_id, w) where user_id = o and church_id is null;
    update public.positions     set church_id = c where user_id = o and church_id is null;
    update public.team_members  set church_id = c where user_id = o and church_id is null;
    update public.media_items   set church_id = c where user_id = o and church_id is null;
    update public.media_folders set church_id = c where user_id = o and church_id is null;
  end loop;
end $$;

-- ─── 5. Who can see and change what ────────────────────────────────────────────────────────

alter table public.churches          enable row level security;
alter table public.workspaces        enable row level security;
alter table public.church_members    enable row level security;
alter table public.workspace_leaders enable row level security;

-- Churches: members see theirs; Admins can rename it. The plan is changed by billing only.
drop policy if exists "Members see their church" on public.churches;
create policy "Members see their church" on public.churches for select using (public.sl_is_member(id));
drop policy if exists "Admins rename their church" on public.churches;
create policy "Admins rename their church" on public.churches for update using (public.sl_is_admin(id)) with check (public.sl_is_admin(id));
revoke insert, update, delete on public.churches from anon, authenticated;
grant select on public.churches to authenticated;
grant update (name) on public.churches to authenticated;

drop policy if exists "Members see workspaces" on public.workspaces;
create policy "Members see workspaces" on public.workspaces for select using (public.sl_is_member(church_id));
drop policy if exists "Admins rename workspaces" on public.workspaces;
create policy "Admins rename workspaces" on public.workspaces for update using (public.sl_is_admin(church_id)) with check (public.sl_is_admin(church_id));
drop policy if exists "Admins delete workspaces" on public.workspaces;
create policy "Admins delete workspaces" on public.workspaces for delete using (public.sl_is_admin(church_id));
revoke insert on public.workspaces from anon, authenticated;   -- added through add_workspace() (plan limit)
revoke update on public.workspaces from anon, authenticated;
grant update (name) on public.workspaces to authenticated;

drop policy if exists "Members see memberships" on public.church_members;
create policy "Members see memberships" on public.church_members for select using (user_id = auth.uid() or public.sl_is_member(church_id));
revoke insert, update, delete on public.church_members from anon, authenticated;   -- changed through the functions below

drop policy if exists "Members see leaders" on public.workspace_leaders;
create policy "Members see leaders" on public.workspace_leaders for select
  using (exists (select 1 from public.workspaces w where w.id = workspace_id and public.sl_is_member(w.church_id)));
revoke insert, update, delete on public.workspace_leaders from anon, authenticated;

-- Songs: Admins and Leaders manage the church library; members see songs in sets they've accepted.
drop policy if exists "Users manage own songs" on public.songs;
drop policy if exists "Church songs: read" on public.songs;
drop policy if exists "Church songs: add" on public.songs;
drop policy if exists "Church songs: change" on public.songs;
drop policy if exists "Church songs: delete" on public.songs;
create policy "Church songs: read"   on public.songs for select using (public.sl_is_editor(church_id) or public.sl_song_in_my_sets(id));
create policy "Church songs: add"    on public.songs for insert with check (public.sl_is_editor(church_id));
create policy "Church songs: change" on public.songs for update using (public.sl_is_editor(church_id)) with check (public.sl_is_editor(church_id));
create policy "Church songs: delete" on public.songs for delete using (public.sl_is_editor(church_id));

-- Sets: Admins, and Leaders of the set's workspace, manage them; members see the ones they've accepted.
drop policy if exists "Users manage own sets" on public.sets;
drop policy if exists "Sets: read" on public.sets;
drop policy if exists "Sets: add" on public.sets;
drop policy if exists "Sets: change" on public.sets;
drop policy if exists "Sets: delete" on public.sets;
create policy "Sets: read"   on public.sets for select using (public.sl_can_edit(church_id, workspace_id) or public.sl_is_scheduled(id));
create policy "Sets: add"    on public.sets for insert with check (public.sl_can_edit(church_id, workspace_id));
create policy "Sets: change" on public.sets for update using (public.sl_can_edit(church_id, workspace_id)) with check (public.sl_can_edit(church_id, workspace_id));
create policy "Sets: delete" on public.sets for delete using (public.sl_can_edit(church_id, workspace_id));

drop policy if exists "Users manage items in own sets" on public.set_items;
drop policy if exists "Set items: read" on public.set_items;
drop policy if exists "Set items: manage" on public.set_items;
create policy "Set items: read"   on public.set_items for select using (public.sl_can_view_set(set_id));
create policy "Set items: manage" on public.set_items for all using (public.sl_can_edit_set(set_id)) with check (public.sl_can_edit_set(set_id));

-- Who's serving: managed by the set's editors; people on the set can see the line-up.
drop policy if exists "Users manage assignments in own sets" on public.set_assignments;
drop policy if exists "Assignments: read" on public.set_assignments;
drop policy if exists "Assignments: manage" on public.set_assignments;
create policy "Assignments: read"   on public.set_assignments for select using (public.sl_can_view_set(set_id));
create policy "Assignments: manage" on public.set_assignments for all using (public.sl_can_edit_set(set_id)) with check (public.sl_can_edit_set(set_id));

-- Team roster and positions: the whole church sees them; Admins and Leaders change them.
drop policy if exists "Users manage own team" on public.team_members;
drop policy if exists "Team: read" on public.team_members;
drop policy if exists "Team: add" on public.team_members;
drop policy if exists "Team: change" on public.team_members;
drop policy if exists "Team: delete" on public.team_members;
create policy "Team: read"   on public.team_members for select using (public.sl_is_member(church_id));
create policy "Team: add"    on public.team_members for insert with check (public.sl_is_editor(church_id));
create policy "Team: change" on public.team_members for update using (public.sl_is_editor(church_id)) with check (public.sl_is_editor(church_id));
create policy "Team: delete" on public.team_members for delete using (public.sl_is_editor(church_id));

drop policy if exists "Users manage own positions" on public.positions;
drop policy if exists "Positions: read" on public.positions;
drop policy if exists "Positions: add" on public.positions;
drop policy if exists "Positions: change" on public.positions;
drop policy if exists "Positions: delete" on public.positions;
create policy "Positions: read"   on public.positions for select using (public.sl_is_member(church_id));
create policy "Positions: add"    on public.positions for insert with check (public.sl_is_editor(church_id));
create policy "Positions: change" on public.positions for update using (public.sl_is_editor(church_id)) with check (public.sl_is_editor(church_id));
create policy "Positions: delete" on public.positions for delete using (public.sl_is_editor(church_id));

-- Content library (PDFs, images): Admins and Leaders.
drop policy if exists "Users manage own media" on public.media_items;
drop policy if exists "Content: manage" on public.media_items;
create policy "Content: manage" on public.media_items for all using (public.sl_is_editor(church_id)) with check (public.sl_is_editor(church_id));
drop policy if exists "Users manage own media folders" on public.media_folders;
drop policy if exists "Content folders: manage" on public.media_folders;
create policy "Content folders: manage" on public.media_folders for all using (public.sl_is_editor(church_id)) with check (public.sl_is_editor(church_id));

-- ─── 6. App functions ───────────────────────────────────────────────────────────────────────

-- Joins the churches whose team roster has this person's email (as a Member). Run on sign-in.
create or replace function public.join_my_teams() returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n int;
begin
  if me is null then return 0; end if;
  insert into public.church_members (church_id, user_id, role)
  select distinct m.church_id, me, 'member'
    from public.team_members m
   where m.church_id is not null and m.email is not null and lower(m.email) = public.sl_email(me)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- Everything the app needs to know about this person's churches, workspaces and roles.
create or replace function public.my_churches() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.name, 'plan', c.plan, 'role', cm.role,
           'editor', public.sl_is_editor(c.id),
           'workspaces', (
             select coalesce(jsonb_agg(jsonb_build_object(
                      'id', w.id, 'name', w.name,
                      'lead', cm.role = 'admin' or exists (select 1 from public.workspace_leaders l where l.workspace_id = w.id and l.user_id = auth.uid()))
                    order by w.created_at), '[]'::jsonb)
               from public.workspaces w where w.church_id = c.id)
         ) order by cm.created_at), '[]'::jsonb)
    from public.church_members cm join public.churches c on c.id = cm.church_id
   where cm.user_id = auth.uid()
$$;

-- Starts a new church (Free, one workspace) with this person as Admin.
create or replace function public.create_church(p_name text, p_workspace text default 'Main Service') returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c uuid;
begin
  if me is null or coalesce(trim(p_name), '') = '' then return null; end if;
  insert into public.churches (name, plan, created_by) values (left(trim(p_name), 120), 'free', me) returning id into c;
  insert into public.church_members (church_id, user_id, role) values (c, me, 'admin');
  insert into public.workspaces (church_id, name) values (c, left(coalesce(nullif(trim(p_workspace), ''), 'Main Service'), 80));
  return c;
end $$;

create or replace function public.workspace_limit(p_plan text) returns int
language sql immutable as $$ select case p_plan when 'ultimate' then 5 else 1 end $$;

-- Adds a workspace (Admins; within the plan's limit). Returns its id, or null when not allowed.
create or replace function public.add_workspace(p_church uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare w uuid; v_plan text; v_count int;
begin
  if not public.sl_is_admin(p_church) or coalesce(trim(p_name), '') = '' then return null; end if;
  select plan into v_plan from public.churches where id = p_church;
  select count(*) into v_count from public.workspaces where church_id = p_church;
  if v_count >= public.workspace_limit(v_plan) then raise exception 'workspace_limit'; end if;
  insert into public.workspaces (church_id, name) values (p_church, left(trim(p_name), 80)) returning id into w;
  return w;
end $$;

-- People in the church with their roles (Admins only: it includes emails).
create or replace function public.church_people(p_church uuid)
returns table (user_id uuid, name text, email text, role text, leads uuid[])
language sql stable security definer set search_path = public as $$
  select cm.user_id,
         coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'), ''), split_part(u.email, '@', 1)),
         u.email, cm.role,
         coalesce(array(select l.workspace_id from public.workspace_leaders l join public.workspaces w on w.id = l.workspace_id
                         where l.user_id = cm.user_id and w.church_id = p_church), '{}')
    from public.church_members cm join auth.users u on u.id = cm.user_id
   where cm.church_id = p_church and public.sl_is_admin(p_church)
   order by (cm.role = 'admin') desc, 2
$$;

-- Adds someone who already has a StaffList account (by email). Returns 'added', 'already' or 'no_account'.
create or replace function public.add_church_person(p_church uuid, p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if not public.sl_is_admin(p_church) then return null; end if;
  select id into u from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if u is null then return 'no_account'; end if;
  insert into public.church_members (church_id, user_id, role) values (p_church, u, 'member') on conflict do nothing;
  return case when found then 'added' else 'already' end;
end $$;

-- Makes someone an Admin or a Member. A church always keeps at least one Admin.
create or replace function public.set_church_role(p_church uuid, p_user uuid, p_role text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.sl_is_admin(p_church) or p_role not in ('admin', 'member') then return false; end if;
  if p_role = 'member' and (select count(*) from public.church_members where church_id = p_church and role = 'admin' and user_id <> p_user) = 0 then
    raise exception 'last_admin';
  end if;
  update public.church_members set role = p_role where church_id = p_church and user_id = p_user;
  return found;
end $$;

-- Makes someone a Leader of a workspace, or stops it.
create or replace function public.set_workspace_leader(p_workspace uuid, p_user uuid, p_on boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  select church_id into c from public.workspaces where id = p_workspace;
  if c is null or not public.sl_is_admin(c) or not public.sl_is_member(c, p_user) then return false; end if;
  if p_on then
    insert into public.workspace_leaders (workspace_id, user_id) values (p_workspace, p_user) on conflict do nothing;
  else
    delete from public.workspace_leaders where workspace_id = p_workspace and user_id = p_user;
  end if;
  return true;
end $$;

-- Removes someone from the church (they rejoin as a Member if they're still on the team roster).
create or replace function public.remove_church_person(p_church uuid, p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.sl_is_admin(p_church) then return false; end if;
  if (select count(*) from public.church_members where church_id = p_church and role = 'admin' and user_id <> p_user) = 0 then
    raise exception 'last_admin';
  end if;
  delete from public.workspace_leaders l using public.workspaces w
   where w.id = l.workspace_id and w.church_id = p_church and l.user_id = p_user;
  delete from public.church_members where church_id = p_church and user_id = p_user;
  return found;
end $$;

grant execute on function public.join_my_teams()                              to authenticated;
grant execute on function public.my_churches()                                to authenticated;
grant execute on function public.create_church(text, text)                    to authenticated;
grant execute on function public.add_workspace(uuid, text)                    to authenticated;
grant execute on function public.church_people(uuid)                          to authenticated;
grant execute on function public.add_church_person(uuid, text)                to authenticated;
grant execute on function public.set_church_role(uuid, uuid, text)            to authenticated;
grant execute on function public.set_workspace_leader(uuid, uuid, boolean)    to authenticated;
grant execute on function public.remove_church_person(uuid, uuid)             to authenticated;

-- ─── 7. Existing functions, now church-wide ─────────────────────────────────────────────────

-- Which team members have a StaffList account: for anyone who manages the church's team.
create or replace function public.team_account_status()
returns table (member_id uuid, has_account boolean)
language sql security definer set search_path = public as $$
  select m.id,
         (m.email is not null and exists (select 1 from auth.users u where lower(u.email) = lower(m.email)))
    from public.team_members m
   where public.sl_is_editor(m.church_id);
$$;

-- Message Team: Admins and Leaders can message anyone on the church's roster.
create or replace function public.send_team_message(p_member_ids uuid[], p_title text, p_body text, p_set_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_leader text;
  r record;
  v_delivered int := 0;
  v_no_account jsonb := '[]'::jsonb;
begin
  if me is null or coalesce(trim(p_body), '') = '' then return null; end if;
  select coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)) into v_leader from auth.users where id = me;
  for r in
    select m.id, m.email,
           (select u.id from auth.users u where m.email is not null and lower(u.email) = lower(m.email) limit 1) as uid
      from public.team_members m
     where public.sl_is_editor(m.church_id) and m.id = any(p_member_ids)
  loop
    if r.uid is not null and r.uid <> me then
      insert into public.notifications (user_id, kind, title, body, set_id)
      values (r.uid, 'team_message',
              left(coalesce(nullif(trim(p_title), ''), 'Message from ' || coalesce(v_leader, 'your worship leader')), 120),
              left(trim(p_body), 2000),
              null);
      v_delivered := v_delivered + 1;
    elsif r.uid is null and r.email is not null then
      v_no_account := v_no_account || to_jsonb(r.id);
    end if;
  end loop;
  return jsonb_build_object('delivered', v_delivered, 'no_account', v_no_account);
end $$;
grant execute on function public.send_team_message(uuid[], text, text, uuid) to authenticated;

-- Calendar subscription: the sets you lead, plus (for musicians and singers) the sets you've accepted.
create or replace function public.calendar_feed(p_token text)
returns table (id uuid, name text, service_date date, service_time time, duration_min int,
               venue_name text, location_address text, location_details text, time_zone text, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select s.id, s.name, s.service_date, s.service_time, s.duration_min,
         s.venue_name, s.location_address, s.location_details, s.time_zone, s.updated_at
    from public.calendar_tokens t
    join public.sets s on public.sl_can_edit(s.church_id, s.workspace_id, t.user_id) or public.sl_is_scheduled(s.id, t.user_id)
   where t.token = p_token and length(p_token) >= 32 and s.service_date is not null;
$$;
grant execute on function public.calendar_feed(text) to anon, authenticated;
