-- StaffList: adds the Solo plan (Free / Solo / Pro / Ultimate). Safe to run again.
--   Solo: presenting and the CCLI Report (checked in the app), 500 MB Content Library,
--         up to 3 devices signed in at once (not enforced yet). No AI tools, scheduling or team,
--         so sl_church_paid() and has_paid_plan() stay Pro and Ultimate only.

begin;

alter table public.churches drop constraint if exists churches_plan_check;
alter table public.churches add constraint churches_plan_check
  check (plan in ('free', 'solo', 'pro', 'ultimate'));

commit;
