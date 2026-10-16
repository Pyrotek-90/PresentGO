-- StaffList: Message Team (run once in Supabase → SQL Editor).
-- Team members with a StaffList account get the message in their bell; the app emails the rest.

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('serving_request', 'request_answered', 'set_reminder', 'team_message'));

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
     where m.user_id = me and m.id = any(p_member_ids)
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
