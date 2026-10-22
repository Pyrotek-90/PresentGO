-- StaffList: joining a team, team details in emails, and team colors.
-- Run once in Supabase → SQL Editor, AFTER 2026-10-22_churches.sql (safe to run again).
--
--  • Team details (church / ministry, location, rehearsals, contact, welcome message) go in every
--    invite email.
--  • The first email a new person gets is an invitation to JOIN the team. Set requests for them
--    wait until they accept (the join page lets them answer those right away).
--  • Each person picks a color per team; sets from that team show in it on Home, the Schedule
--    calendar and (per-team subscription) their phone's calendar.

-- ─── 1. Team details ─────────────────────────────────────────────────────────────────────────
-- { church_name, location, rehearsals, contact_name, contact_email, contact_phone, welcome }
alter table public.churches add column if not exists details jsonb not null default '{}'::jsonb;

-- ─── 2. Joining a team (on the team roster) ─────────────────────────────────────────────────
alter table public.team_members
  add column if not exists join_status       text not null default 'not_invited',
  add column if not exists join_token        text unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  add column if not exists join_invited_at   timestamptz,
  add column if not exists join_invited_by   uuid references auth.users(id) on delete set null,
  add column if not exists join_responded_at timestamptz;

do $$ begin
  alter table public.team_members
    add constraint team_members_join_status_check check (join_status in ('not_invited', 'invited', 'accepted', 'declined'));
exception when duplicate_object then null; end $$;

update public.team_members
   set join_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
 where join_token is null;

-- Everyone already serving (accepted a set) or already in the church counts as joined.
update public.team_members m
   set join_status = 'accepted', join_responded_at = coalesce(m.join_responded_at, now())
 where m.join_status <> 'accepted' and (
       exists (select 1 from public.set_assignments a where a.member_id = m.id and a.status = 'accepted')
    or (m.email is not null and exists (
          select 1 from public.church_members cm join auth.users u on u.id = cm.user_id
           where cm.church_id = m.church_id and lower(u.email) = lower(m.email))));

-- A roster entry for someone already in the church (e.g. a leader adding themselves) is joined.
create or replace function public.sl_member_joined_default() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is not null and new.church_id is not null and new.join_status <> 'accepted' and exists (
       select 1 from public.church_members cm join auth.users u on u.id = cm.user_id
        where cm.church_id = new.church_id and lower(u.email) = lower(new.email)) then
    new.join_status := 'accepted';
    new.join_responded_at := coalesce(new.join_responded_at, now());
  end if;
  return new;
end $$;
drop trigger if exists sl_member_joined_default on public.team_members;
create trigger sl_member_joined_default before insert or update of email, church_id on public.team_members
  for each row execute function public.sl_member_joined_default();

-- ─── 3. Team colors (each person's own choice, per team) ────────────────────────────────────
alter table public.church_members add column if not exists color text;
do $$ begin
  alter table public.church_members add constraint church_members_color_check check (color is null or color ~ '^#[0-9a-fA-F]{6}$');
exception when duplicate_object then null; end $$;

-- ─── 4. Joining ──────────────────────────────────────────────────────────────────────────────

-- Adds the StaffList account with this email (if there is one) to the team's church.
create or replace function public.sl_join_church(p_church uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if p_church is null or p_email is null then return; end if;
  select id into u from auth.users where lower(email) = lower(p_email) limit 1;
  if u is not null then
    insert into public.church_members (church_id, user_id, role) values (p_church, u, 'member') on conflict do nothing;
  end if;
end $$;

-- On sign-in: joins the teams this person has accepted (by the email on the roster).
create or replace function public.join_my_teams() returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n int;
begin
  if me is null then return 0; end if;
  insert into public.church_members (church_id, user_id, role)
  select distinct m.church_id, me, 'member'
    from public.team_members m
   where m.church_id is not null and m.join_status = 'accepted'
     and m.email is not null and lower(m.email) = public.sl_email(me)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- What the join page shows (no login needed; only with the private link). Includes the set
-- requests waiting for this person, each with its own Accept / Decline link token.
create or replace function public.team_invite_details(p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
           'member_id', m.id, 'member_name', m.name, 'status', m.join_status,
           'team', c.name, 'plan', c.plan, 'details', c.details,
           'inviter', coalesce(nullif(trim(iu.raw_user_meta_data->>'full_name'), ''), split_part(iu.email, '@', 1)),
           'requests', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'token', a.invite_token, 'status', a.status, 'position', p.name,
                      'set_name', s.name, 'service_date', s.service_date, 'service_time', s.service_time,
                      'venue_name', s.venue_name, 'location_address', s.location_address)
                    order by s.service_date nulls last, s.service_time)
               from public.set_assignments a
               join public.sets s on s.id = a.set_id
               left join public.positions p on p.id = a.position_id
              where a.member_id = m.id and a.status in ('invited', 'accepted', 'declined')
                and (s.service_date is null or s.service_date >= current_date)), '[]'::jsonb))
    from public.team_members m
    join public.churches c on c.id = m.church_id
    left join auth.users iu on iu.id = coalesce(m.join_invited_by, c.created_by)
   where m.join_token = p_token and length(p_token) >= 32
$$;

create or replace function public.sl_set_join(p_member uuid, p_response text) returns text
language plpgsql security definer set search_path = public as $$
declare v text; c uuid; e text;
begin
  update public.team_members
     set join_status = p_response, join_responded_at = now()
   where id = p_member
  returning join_status, church_id, email into v, c, e;
  if v = 'accepted' then
    perform public.sl_join_church(c, e);
    -- set requests that were waiting for them to join now reach their bell
    insert into public.notifications (user_id, kind, title, body, set_id, assignment_id, dedupe_key)
    select u.id, 'serving_request',
           coalesce(nullif(trim(lu.raw_user_meta_data->>'full_name'), ''), split_part(lu.email, '@', 1)) || ' asked you to serve as ' || coalesce(p.name, 'a team member'),
           s.name || coalesce(' · ' || to_char(s.service_date, 'FMDy, FMMon FMDD'), ''),
           a.set_id, a.id, 'req:' || a.id || ':' || coalesce(a.invited_at::text, '0')
      from public.set_assignments a
      join public.sets s on s.id = a.set_id
      join auth.users u on lower(u.email) = lower(e)
      join auth.users lu on lu.id = s.user_id
      left join public.positions p on p.id = a.position_id
     where a.member_id = p_member and a.status = 'invited' and u.id <> s.user_id
       and (s.service_date is null or s.service_date >= current_date)
    on conflict (user_id, dedupe_key) do nothing;
  end if;
  update public.notifications set read_at = coalesce(read_at, now()) where member_id = p_member and kind = 'team_invite';
  return v;
end $$;

-- Answer from the email link.
create or replace function public.respond_team_invite(p_token text, p_response text) returns text
language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  if p_response not in ('accepted', 'declined') or length(p_token) < 32 then return null; end if;
  select id into m from public.team_members where join_token = p_token;
  if m is null then return null; end if;
  return public.sl_set_join(m, p_response);
end $$;

-- Answer from inside the app (bell, or the welcome screen): only the person invited.
create or replace function public.respond_team_member(p_member uuid, p_response text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if p_response not in ('accepted', 'declined') then return null; end if;
  if not exists (select 1 from public.team_members m where m.id = p_member and m.email is not null and lower(m.email) = public.sl_email(auth.uid())) then
    return null;
  end if;
  return public.sl_set_join(p_member, p_response);
end $$;

-- Team invitations waiting for me (for people who haven't joined any team yet).
create or replace function public.my_team_invites() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'member_id', m.id, 'team', c.name, 'details', c.details,
           'inviter', coalesce(nullif(trim(iu.raw_user_meta_data->>'full_name'), ''), split_part(iu.email, '@', 1)))
         order by m.join_invited_at desc), '[]'::jsonb)
    from public.team_members m
    join public.churches c on c.id = m.church_id
    left join auth.users iu on iu.id = coalesce(m.join_invited_by, c.created_by)
   where m.join_status = 'invited' and m.email is not null and lower(m.email) = public.sl_email(auth.uid())
$$;

-- Saying yes to a set means you're on the team.
create or replace function public.respond_invite(p_token text, p_response text)
returns text
language plpgsql security definer set search_path = public as $$
declare v text; mid uuid;
begin
  if p_response not in ('accepted', 'declined') or length(p_token) < 32 then return null; end if;
  update public.set_assignments
     set status = p_response, responded_at = now()
   where invite_token = p_token
  returning status, member_id into v, mid;
  if v = 'accepted' and exists (select 1 from public.team_members where id = mid and join_status <> 'accepted') then
    perform public.sl_set_join(mid, 'accepted');
  end if;
  return v;
end $$;

create or replace function public.respond_assignment(p_assignment uuid, p_response text)
returns text
language plpgsql security definer set search_path = public as $$
declare v text; mid uuid;
begin
  if p_response not in ('accepted', 'declined') then return null; end if;
  update public.set_assignments a
     set status = p_response, responded_at = now()
   where a.id = p_assignment
     and exists (select 1 from public.team_members m join auth.users u on lower(u.email) = lower(m.email)
                  where m.id = a.member_id and u.id = auth.uid())
  returning a.status, a.member_id into v, mid;
  if v is not null then
    update public.notifications set read_at = coalesce(read_at, now())
     where user_id = auth.uid() and assignment_id = p_assignment and kind = 'serving_request';
  end if;
  if v = 'accepted' and exists (select 1 from public.team_members where id = mid and join_status <> 'accepted') then
    perform public.sl_set_join(mid, 'accepted');
  end if;
  return v;
end $$;

-- ─── 5. Team invitations in the bell (for people who already use StaffList) ──────────────────

alter table public.notifications add column if not exists member_id uuid references public.team_members(id) on delete cascade;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('serving_request', 'request_answered', 'set_reminder', 'team_message', 'team_invite'));

create or replace function public.notify_team_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_uid uuid; v_team text; v_by text;
begin
  if new.join_status = 'invited' and new.email is not null
     and (tg_op = 'INSERT' or old.join_status is distinct from 'invited' or old.join_invited_at is distinct from new.join_invited_at) then
    select id into v_uid from auth.users where lower(email) = lower(new.email) limit 1;
    if v_uid is not null and not public.sl_is_member(new.church_id, v_uid) then
      select name into v_team from public.churches where id = new.church_id;
      select coalesce(nullif(trim(raw_user_meta_data->>'full_name'), ''), split_part(email, '@', 1)) into v_by
        from auth.users where id = new.join_invited_by;
      insert into public.notifications (user_id, kind, title, body, member_id, dedupe_key)
      values (v_uid, 'team_invite',
              coalesce(v_by, 'A worship leader') || ' invited you to join ' || coalesce(v_team, 'their team'),
              'Join to get set requests, charts and lyrics in StaffList.',
              new.id, 'team:' || new.id || ':' || coalesce(new.join_invited_at::text, '0'))
      on conflict (user_id, dedupe_key) do nothing;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists team_members_notify_invite on public.team_members;
create trigger team_members_notify_invite after insert or update of join_status, join_invited_at on public.team_members
  for each row execute function public.notify_team_invite();

-- The bell's list, now with team invitations and their answer.
drop function if exists public.my_notifications(int);
create function public.my_notifications(p_limit int default 40)
returns table (id uuid, kind text, title text, body text, set_id uuid, assignment_id uuid,
               read_at timestamptz, created_at timestamptz, assignment_status text, member_id uuid, join_status text)
language sql security definer set search_path = public as $$
  select n.id, n.kind, n.title, n.body, n.set_id, n.assignment_id, n.read_at, n.created_at, a.status, n.member_id, m.join_status
    from public.notifications n
    left join public.set_assignments a on a.id = n.assignment_id
    left join public.team_members m on m.id = n.member_id
   where n.user_id = auth.uid()
   order by n.created_at desc
   limit least(coalesce(p_limit, 40), 100);
$$;
grant execute on function public.my_notifications(int) to authenticated;

-- People who sign up after being invited: their team invitation (and set requests) show up.
create or replace function public.deliver_waiting_requests()
returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); my_email text; n int; t int;
begin
  if me is null then return 0; end if;
  select email into my_email from auth.users where id = me;
  if my_email is null then return 0; end if;
  insert into public.notifications (user_id, kind, title, body, set_id, assignment_id, dedupe_key)
  select me, 'serving_request',
         coalesce(lu.raw_user_meta_data->>'full_name', split_part(lu.email, '@', 1)) || ' asked you to serve as ' || coalesce(p.name, 'a team member'),
         s.name || coalesce(' · ' || to_char(s.service_date, 'FMDy, FMMon FMDD'), ''),
         a.set_id, a.id, 'req:' || a.id || ':' || coalesce(a.invited_at::text, '0')
    from public.set_assignments a
    join public.sets s          on s.id = a.set_id
    join public.team_members m  on m.id = a.member_id
    join auth.users lu          on lu.id = s.user_id
    left join public.positions p on p.id = a.position_id
   where a.status = 'invited' and lower(m.email) = lower(my_email) and s.user_id <> me and m.join_status = 'accepted'
     and (s.service_date is null or s.service_date >= current_date)
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics n = row_count;
  insert into public.notifications (user_id, kind, title, body, member_id, dedupe_key)
  select me, 'team_invite',
         coalesce(nullif(trim(iu.raw_user_meta_data->>'full_name'), ''), split_part(iu.email, '@', 1), 'A worship leader') || ' invited you to join ' || c.name,
         'Join to get set requests, charts and lyrics in StaffList.',
         m.id, 'team:' || m.id || ':' || coalesce(m.join_invited_at::text, '0')
    from public.team_members m
    join public.churches c on c.id = m.church_id
    left join auth.users iu on iu.id = coalesce(m.join_invited_by, c.created_by)
   where m.join_status = 'invited' and lower(m.email) = lower(my_email) and not public.sl_is_member(m.church_id, me)
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics t = row_count;
  return n + t;
end $$;

-- Set requests reach the bell only once the person has joined the team (the join invitation
-- comes first). Same as before otherwise.
create or replace function public.notify_assignment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_set     public.sets%rowtype;
  v_member  record;
  v_pos     text;
  v_uid     uuid;
  v_leader  text;
  v_when    text;
begin
  select * into v_set from public.sets where id = new.set_id;
  select name, email, join_status into v_member from public.team_members where id = new.member_id;
  select name into v_pos from public.positions where id = new.position_id;
  v_when := coalesce(to_char(v_set.service_date, 'FMDy, FMMon FMDD'), '');

  if new.status = 'invited' and (tg_op = 'INSERT' or old.status is distinct from 'invited' or old.invited_at is distinct from new.invited_at) then
    if v_member.email is not null and v_member.join_status = 'accepted' then
      select id into v_uid from auth.users where lower(email) = lower(v_member.email) limit 1;
      if v_uid is not null and v_uid <> v_set.user_id then
        select coalesce(raw_user_meta_data->>'full_name', split_part(email, '@', 1)) into v_leader from auth.users where id = v_set.user_id;
        insert into public.notifications (user_id, kind, title, body, set_id, assignment_id, dedupe_key)
        values (v_uid, 'serving_request',
                coalesce(v_leader, 'Your worship leader') || ' asked you to serve as ' || coalesce(v_pos, 'a team member'),
                v_set.name || case when v_when <> '' then ' · ' || v_when else '' end,
                new.set_id, new.id, 'req:' || new.id || ':' || coalesce(new.invited_at::text, '0'))
        on conflict (user_id, dedupe_key) do nothing;
      end if;
    end if;
  elsif tg_op = 'UPDATE' and new.status in ('accepted', 'declined') and old.status is distinct from new.status then
    insert into public.notifications (user_id, kind, title, body, set_id, assignment_id, dedupe_key)
    values (v_set.user_id, 'request_answered',
            coalesce(v_member.name, 'Someone') || case when new.status = 'accepted' then ' accepted' else ' declined' end || ' · ' || coalesce(v_pos, 'team member'),
            v_set.name || case when v_when <> '' then ' · ' || v_when else '' end,
            new.set_id, new.id, 'ans:' || new.id || ':' || coalesce(new.responded_at::text, '0'))
    on conflict (user_id, dedupe_key) do nothing;
  end if;
  return new;
end $$;

-- ─── 6. Team details and colors ─────────────────────────────────────────────────────────────

-- Admins and leaders edit the team details; only Admins rename the team.
create or replace function public.save_team_details(p_church uuid, p_name text, p_details jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare clean jsonb := '{}'::jsonb; k text;
begin
  if not public.sl_is_editor(p_church) then return false; end if;
  foreach k in array array['church_name', 'location', 'rehearsals', 'contact_name', 'contact_email', 'contact_phone', 'welcome'] loop
    if coalesce(trim(p_details->>k), '') <> '' then clean := clean || jsonb_build_object(k, left(trim(p_details->>k), 1000)); end if;
  end loop;
  update public.churches
     set details = clean,
         name = case when public.sl_is_admin(p_church) and coalesce(trim(p_name), '') <> '' then left(trim(p_name), 120) else name end
   where id = p_church;
  return found;
end $$;

create or replace function public.set_my_team_color(p_church uuid, p_color text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_color is not null and p_color !~ '^#[0-9a-fA-F]{6}$' then return false; end if;
  update public.church_members set color = lower(p_color) where church_id = p_church and user_id = auth.uid();
  return found;
end $$;

-- my_churches now includes my color for each team.
create or replace function public.my_churches() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'name', c.name, 'plan', c.plan, 'role', cm.role, 'color', cm.color,
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

-- The sets I serve on, in every team I've joined: accepted ones, and requests waiting for my
-- answer (with the token for their Accept / Decline page).
create or replace function public.my_serving_sets()
returns table (set_id uuid, church_id uuid, workspace_id uuid, name text, service_date date, service_time time,
               venue_name text, location_address text, status text, invite_token text, positions text[], song_count int)
language sql stable security definer set search_path = public as $$
  select s.id, s.church_id, s.workspace_id, s.name, s.service_date, s.service_time, s.venue_name, s.location_address,
         case when bool_or(a.status = 'accepted') then 'accepted' else 'invited' end,
         (array_agg(a.invite_token order by (a.status = 'invited') desc))[1],
         array_agg(distinct p.name) filter (where p.name is not null),
         (select count(*)::int from public.set_items si where si.set_id = s.id and si.type = 'song')
    from public.set_assignments a
    join public.team_members m on m.id = a.member_id
    join public.sets s on s.id = a.set_id
    left join public.positions p on p.id = a.position_id
   where m.email is not null and lower(m.email) = public.sl_email(auth.uid())
     and (a.status = 'accepted' or (a.status = 'invited' and m.join_status = 'accepted'))
   group by s.id
$$;

grant execute on function public.team_invite_details(text)            to anon, authenticated;
grant execute on function public.respond_team_invite(text, text)      to anon, authenticated;
grant execute on function public.respond_team_member(uuid, text)      to authenticated;
grant execute on function public.my_team_invites()                    to authenticated;
grant execute on function public.save_team_details(uuid, text, jsonb) to authenticated;
grant execute on function public.set_my_team_color(uuid, text)        to authenticated;
grant execute on function public.my_serving_sets()                    to authenticated;
grant execute on function public.join_my_teams()                      to authenticated;
grant execute on function public.my_churches()                        to authenticated;
grant execute on function public.deliver_waiting_requests()           to authenticated;
revoke execute on function public.sl_set_join(uuid, text)             from anon, authenticated, public;
revoke execute on function public.sl_join_church(uuid, text)          from anon, authenticated, public;

-- ─── 7. Phone calendar: one subscription per team (so each gets its own color) ───────────────

drop function if exists public.calendar_feed(text);
drop function if exists public.calendar_feed(text, uuid);
create function public.calendar_feed(p_token text, p_church uuid default null)
returns table (id uuid, name text, service_date date, service_time time, duration_min int,
               venue_name text, location_address text, location_details text, time_zone text, updated_at timestamptz,
               church_id uuid, church_name text, color text)
language sql security definer set search_path = public as $$
  select s.id, s.name, s.service_date, s.service_time, s.duration_min,
         s.venue_name, s.location_address, s.location_details, s.time_zone, s.updated_at,
         s.church_id, c.name, cm.color
    from public.calendar_tokens t
    join public.sets s on public.sl_can_edit(s.church_id, s.workspace_id, t.user_id) or public.sl_is_scheduled(s.id, t.user_id)
    left join public.churches c on c.id = s.church_id
    left join public.church_members cm on cm.church_id = s.church_id and cm.user_id = t.user_id
   where t.token = p_token and length(p_token) >= 32 and s.service_date is not null
     and (p_church is null or s.church_id = p_church);
$$;
grant execute on function public.calendar_feed(text, uuid) to anon, authenticated;

-- ─── 8. Privacy: invite links and contact details stay with the leaders ─────────────────────
-- Musicians and singers see their own roster entry and their own requests; the full roster
-- (emails, phones) and everyone's answer links are for Admins and Leaders.

create or replace function public.sl_is_me(p_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.team_members m
                  where m.id = p_member and m.email is not null and lower(m.email) = public.sl_email(auth.uid()))
$$;

drop policy if exists "Team: read" on public.team_members;
create policy "Team: read" on public.team_members for select
  using (public.sl_is_editor(church_id) or (email is not null and lower(email) = public.sl_email(auth.uid())));

drop policy if exists "Assignments: read" on public.set_assignments;
create policy "Assignments: read" on public.set_assignments for select
  using (public.sl_can_edit_set(set_id) or public.sl_is_me(member_id));
