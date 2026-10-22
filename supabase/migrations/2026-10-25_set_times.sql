-- StaffList: extra times on a set (rehearsal, practice, run-thru…), each with its own name,
-- date, time and length. Replaces the single rehearsal date/time. Safe to run again.

alter table public.sets add column if not exists extra_times jsonb not null default '[]'::jsonb;

-- Rehearsals already entered move into the new list.
alter table public.sets add column if not exists rehearsal_date date;
alter table public.sets add column if not exists rehearsal_time time;
update public.sets
   set extra_times = jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
         'label', 'Rehearsal', 'date', rehearsal_date, 'time', to_char(rehearsal_time, 'HH24:MI'), 'minutes', 90))),
       rehearsal_date = null, rehearsal_time = null
 where rehearsal_date is not null and extra_times = '[]'::jsonb;

-- The Accept / Decline page lists the set's times.
drop function if exists public.invite_details(text);
create function public.invite_details(p_token text)
returns table (member_name text, position_name text, set_name text, service_date date, service_time time,
               venue_name text, location_address text, status text, inviter_name text, extra_times jsonb)
language sql security definer set search_path = public as $$
  select m.name, p.name, s.name, s.service_date, s.service_time, s.venue_name, s.location_address, a.status,
         coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
         s.extra_times
    from public.set_assignments a
    join public.sets s          on s.id = a.set_id
    join public.team_members m  on m.id = a.member_id
    join public.positions p     on p.id = a.position_id
    join auth.users u           on u.id = s.user_id
   where a.invite_token = p_token and length(p_token) >= 32;
$$;
grant execute on function public.invite_details(text) to anon, authenticated;

-- The join page lists each set's times.
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
                      'venue_name', s.venue_name, 'location_address', s.location_address,
                      'extra_times', s.extra_times)
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

-- Calendar subscriptions add each time as its own event.
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
    left join public.churches c on c.id = s.church_id
    left join public.church_members cm on cm.church_id = s.church_id and cm.user_id = t.user_id
   where t.token = p_token and length(p_token) >= 32 and s.service_date is not null
     and (p_church is null or s.church_id = p_church);
$$;
grant execute on function public.calendar_feed(text, uuid) to anon, authenticated;
