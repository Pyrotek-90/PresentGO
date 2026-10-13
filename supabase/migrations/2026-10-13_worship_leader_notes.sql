-- Worship Leader Notes: a new set item type 'note' (shown in the Song Viewer, never on the TV).
-- Run once in Supabase → SQL Editor.

alter table public.set_items drop constraint if exists set_items_type_check;
alter table public.set_items
  add constraint set_items_type_check
  check (type in ('song', 'welcome', 'announcement', 'blank', 'media', 'note'));
