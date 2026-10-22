-- StaffList: Free / Pro / Ultimate. The database itself keeps Pro features to Pro teams, so they
-- can't be reached around the app. Safe to run again.
--   Free: songs, charts, sets, the schedule calendar, Team Details; the roster can be viewed.
--   Pro:  adds people to the roster, scheduling and invitations, Message Team, calendar sync,
--         AI tools (checked by the app's server functions through has_paid_plan()).

begin;

-- Is this team on Pro or Ultimate?
create or replace function public.sl_church_paid(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select plan in ('pro', 'ultimate') from public.churches where id = c), false)
$$;

-- Is the signed-in person on any Pro or Ultimate team? (Used by the AI and email functions.)
create or replace function public.has_paid_plan() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.church_members cm join public.churches c on c.id = cm.church_id
                  where cm.user_id = auth.uid() and c.plan in ('pro', 'ultimate'))
$$;
grant execute on function public.has_paid_plan() to authenticated;

-- Team roster: everyone keeps seeing it; adding, changing and removing people is Pro.
drop policy if exists "Team: add" on public.team_members;
drop policy if exists "Team: change" on public.team_members;
drop policy if exists "Team: delete" on public.team_members;
create policy "Team: add"    on public.team_members for insert
  with check (public.sl_is_editor(church_id) and public.sl_church_paid(church_id));
create policy "Team: change" on public.team_members for update
  using (public.sl_is_editor(church_id) and public.sl_church_paid(church_id))
  with check (public.sl_is_editor(church_id) and public.sl_church_paid(church_id));
create policy "Team: delete" on public.team_members for delete
  using (public.sl_is_editor(church_id) and public.sl_church_paid(church_id));

-- Scheduling people on sets is Pro; taking someone off a set stays possible.
create or replace function public.sl_set_paid(s uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select public.sl_church_paid(church_id) from public.sets where id = s), false)
$$;
drop policy if exists "Assignments: manage" on public.set_assignments;
drop policy if exists "Assignments: add" on public.set_assignments;
drop policy if exists "Assignments: change" on public.set_assignments;
drop policy if exists "Assignments: remove" on public.set_assignments;
create policy "Assignments: add"    on public.set_assignments for insert
  with check (public.sl_can_edit_set(set_id) and public.sl_set_paid(set_id));
create policy "Assignments: change" on public.set_assignments for update
  using (public.sl_can_edit_set(set_id) and public.sl_set_paid(set_id))
  with check (public.sl_can_edit_set(set_id) and public.sl_set_paid(set_id));
create policy "Assignments: remove" on public.set_assignments for delete
  using (public.sl_can_edit_set(set_id));

-- Message Team is Pro.
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
     where public.sl_is_editor(m.church_id) and public.sl_church_paid(m.church_id) and m.id = any(p_member_ids)
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

-- Calendar sync is Pro: subscriptions only carry sets from Pro and Ultimate teams.
drop function if exists public.calendar_feed(text);
drop function if exists public.calendar_feed(text, uuid);
create function public.calendar_feed(p_token text, p_church uuid default null)
returns table (id uuid, name text, service_date date, service_time time, duration_min int,
               venue_name text, location_address text, location_details text, time_zone text, updated_at timestamptz,
               church_id uuid, church_name text, color text, extra_times jsonb)
language sql security definer set search_path = public as $$
  select s.id, s.name, s.service_date, s.service_time, s.duration_min,
         s.venue_name, s.location_address, s.location_details, s.time_zone, s.updated_at,
         s.church_id, c.name, cm.color, s.extra_times
    from public.calendar_tokens t
    join public.sets s on public.sl_can_edit(s.church_id, s.workspace_id, t.user_id) or public.sl_is_scheduled(s.id, t.user_id)
    join public.churches c on c.id = s.church_id and c.plan in ('pro', 'ultimate')
    left join public.church_members cm on cm.church_id = s.church_id and cm.user_id = t.user_id
   where t.token = p_token and length(p_token) >= 32 and s.service_date is not null
     and (p_church is null or s.church_id = p_church);
$$;
grant execute on function public.calendar_feed(text, uuid) to anon, authenticated;

commit;
