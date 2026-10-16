-- StaffList: show which team members have a StaffList account, and deliver waiting requests
-- to people who sign up after being invited (run once in Supabase → SQL Editor).

-- Which of YOUR team members have an account (matched by email). Only your own team is checked.
create or replace function public.team_account_status()
returns table (member_id uuid, has_account boolean)
language sql security definer set search_path = public as $$
  select m.id,
         (m.email is not null and exists (select 1 from auth.users u where lower(u.email) = lower(m.email)))
    from public.team_members m
   where m.user_id = auth.uid();
$$;

-- Requests sent to your email before you had an account appear in your bell the first time you open the app.
create or replace function public.deliver_waiting_requests()
returns int
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); my_email text; n int;
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
   where a.status = 'invited' and lower(m.email) = lower(my_email) and s.user_id <> me
     and (s.service_date is null or s.service_date >= current_date)
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

grant execute on function public.team_account_status()        to authenticated;
grant execute on function public.deliver_waiting_requests()   to authenticated;
