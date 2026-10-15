-- StaffList notifications (run once in Supabase → SQL Editor).
--  • Serving requests appear in the team member's bell (matched by the email on their team record
--    and their StaffList login), where they can Accept or Decline.
--  • The leader is notified when someone accepts or declines (in the app or from the email link).
--  • Set reminders 7 and 2 days before a set, for the leader and for team members who accepted.

create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('serving_request', 'request_answered', 'set_reminder')),
  title         text not null,
  body          text,
  set_id        uuid references public.sets(id) on delete cascade,
  assignment_id uuid references public.set_assignments(id) on delete cascade,
  dedupe_key    text,
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "Read own notifications" on public.notifications;
create policy "Read own notifications" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "Update own notifications" on public.notifications;
create policy "Update own notifications" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Delete own notifications" on public.notifications;
create policy "Delete own notifications" on public.notifications for delete using (auth.uid() = user_id);
-- No insert policy: notifications are only created by the functions below.

do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when others then null; end $$;

-- 1. When an assignment is invited / answered, create the notification.
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
  select name, email into v_member from public.team_members where id = new.member_id;
  select name into v_pos from public.positions where id = new.position_id;
  v_when := coalesce(to_char(v_set.service_date, 'FMDy, FMMon FMDD'), '');

  if new.status = 'invited' and (tg_op = 'INSERT' or old.status is distinct from 'invited' or old.invited_at is distinct from new.invited_at) then
    if v_member.email is not null then
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

drop trigger if exists set_assignments_notify on public.set_assignments;
create trigger set_assignments_notify after insert or update of status, invited_at on public.set_assignments
  for each row execute function public.notify_assignment();

-- Requests already sent for upcoming sets show up right away.
insert into public.notifications (user_id, kind, title, body, set_id, assignment_id, dedupe_key)
select u.id, 'serving_request',
       coalesce(lu.raw_user_meta_data->>'full_name', split_part(lu.email, '@', 1)) || ' asked you to serve as ' || coalesce(p.name, 'a team member'),
       s.name || coalesce(' · ' || to_char(s.service_date, 'FMDy, FMMon FMDD'), ''),
       a.set_id, a.id, 'req:' || a.id || ':' || coalesce(a.invited_at::text, '0')
  from public.set_assignments a
  join public.sets s          on s.id = a.set_id
  join public.team_members m  on m.id = a.member_id
  join auth.users u           on lower(u.email) = lower(m.email)
  join auth.users lu          on lu.id = s.user_id
  left join public.positions p on p.id = a.position_id
 where a.status = 'invited' and u.id <> s.user_id and (s.service_date is null or s.service_date >= current_date)
on conflict (user_id, dedupe_key) do nothing;

-- 2. The bell's list, with the current answer for serving requests.
create or replace function public.my_notifications(p_limit int default 40)
returns table (id uuid, kind text, title text, body text, set_id uuid, assignment_id uuid,
               read_at timestamptz, created_at timestamptz, assignment_status text)
language sql security definer set search_path = public as $$
  select n.id, n.kind, n.title, n.body, n.set_id, n.assignment_id, n.read_at, n.created_at, a.status
    from public.notifications n
    left join public.set_assignments a on a.id = n.assignment_id
   where n.user_id = auth.uid()
   order by n.created_at desc
   limit least(coalesce(p_limit, 40), 100);
$$;

-- 3. Accept / Decline from inside the app (only the person the request was sent to).
create or replace function public.respond_assignment(p_assignment uuid, p_response text)
returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if p_response not in ('accepted', 'declined') then return null; end if;
  update public.set_assignments a
     set status = p_response, responded_at = now()
   where a.id = p_assignment
     and exists (select 1 from public.team_members m join auth.users u on lower(u.email) = lower(m.email)
                  where m.id = a.member_id and u.id = auth.uid())
  returning a.status into v;
  if v is not null then
    update public.notifications set read_at = coalesce(read_at, now())
     where user_id = auth.uid() and assignment_id = p_assignment and kind = 'serving_request';
  end if;
  return v;
end $$;

-- 4. Reminders 7 and 2 days before a set. The app calls this when it opens (and every few minutes).
create or replace function public.generate_reminders(p_today date default current_date)
returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; c int; r record; me uuid := auth.uid(); my_email text;
begin
  if me is null then return 0; end if;
  select email into my_email from auth.users where id = me;

  -- Sets you lead.
  for r in
    select s.id, s.name, s.service_date, s.service_time, (s.service_date - p_today) as d,
           (select count(*) from public.set_items i where i.set_id = s.id and i.type = 'song') as songs
      from public.sets s
     where s.user_id = me and s.service_date between p_today and p_today + 7
  loop
    insert into public.notifications (user_id, kind, title, body, set_id, dedupe_key)
    values (me, 'set_reminder',
            r.name || case r.d when 0 then ' is today' when 1 then ' is tomorrow' else ' is in ' || r.d || ' days' end,
            case when r.songs = 0 then 'No songs chosen yet — pick them now.' else r.songs || ' song' || case when r.songs = 1 then '' else 's' end || ' chosen. Time to practice.' end
              || coalesce(' · ' || to_char(r.service_date, 'FMDy, FMMon FMDD'), ''),
            r.id, 'rem:' || r.id || ':' || case when r.d <= 2 then '2d' else '7d' end)
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics c = row_count; n := n + c;
  end loop;

  -- Sets you accepted a spot on.
  for r in
    select distinct on (s.id) s.id, s.name, s.service_date, s.service_time, (s.service_date - p_today) as d, p.name as pos
      from public.set_assignments a
      join public.sets s          on s.id = a.set_id
      join public.team_members m  on m.id = a.member_id
      left join public.positions p on p.id = a.position_id
     where a.status = 'accepted' and s.user_id <> me and lower(m.email) = lower(my_email)
       and s.service_date between p_today and p_today + 7
     order by s.id
  loop
    insert into public.notifications (user_id, kind, title, body, set_id, dedupe_key)
    values (me, 'set_reminder',
            r.name || case r.d when 0 then ' is today' when 1 then ' is tomorrow' else ' is in ' || r.d || ' days' end,
            'You''re serving as ' || coalesce(r.pos, 'a team member') || coalesce(' · ' || to_char(r.service_date, 'FMDy, FMMon FMDD'), '')
              || coalesce(' at ' || to_char(r.service_time, 'FMHH12:MI AM'), ''),
            r.id, 'rem:' || r.id || ':' || case when r.d <= 2 then '2d' else '7d' end)
    on conflict (user_id, dedupe_key) do nothing;
    get diagnostics c = row_count; n := n + c;
  end loop;
  return n;
end $$;

grant execute on function public.my_notifications(int)           to authenticated;
grant execute on function public.respond_assignment(uuid, text)  to authenticated;
grant execute on function public.generate_reminders(date)        to authenticated;
