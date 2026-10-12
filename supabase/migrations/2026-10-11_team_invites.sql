-- StaffList: team invites with Accept / Decline (run once in Supabase → SQL Editor)

-- 1. Each set assignment gets a status, a private invite token, and when it was sent / answered.
alter table public.set_assignments
  add column if not exists status       text not null default 'draft',
  add column if not exists invite_token text unique default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  add column if not exists invited_at   timestamptz,
  add column if not exists responded_at timestamptz;

do $$ begin
  alter table public.set_assignments
    add constraint set_assignments_status_check check (status in ('draft', 'invited', 'accepted', 'declined'));
exception when duplicate_object then null; end $$;

update public.set_assignments
   set invite_token = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
 where invite_token is null;

-- 2. What the invite page shows (no login needed; only works with the private token).
create or replace function public.invite_details(p_token text)
returns table (member_name text, position_name text, set_name text, service_date date, service_time time,
               venue_name text, location_address text, status text, inviter_name text)
language sql security definer set search_path = public as $$
  select m.name, p.name, s.name, s.service_date, s.service_time, s.venue_name, s.location_address, a.status,
         coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1))
    from public.set_assignments a
    join public.sets s          on s.id = a.set_id
    join public.team_members m  on m.id = a.member_id
    join public.positions p     on p.id = a.position_id
    join auth.users u           on u.id = s.user_id
   where a.invite_token = p_token and length(p_token) >= 32;
$$;

-- 3. Saves the person's answer.
create or replace function public.respond_invite(p_token text, p_response text)
returns text
language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if p_response not in ('accepted', 'declined') or length(p_token) < 32 then return null; end if;
  update public.set_assignments
     set status = p_response, responded_at = now()
   where invite_token = p_token
  returning status into v;
  return v;
end $$;

grant execute on function public.invite_details(text)        to anon, authenticated;
grant execute on function public.respond_invite(text, text)  to anon, authenticated;
