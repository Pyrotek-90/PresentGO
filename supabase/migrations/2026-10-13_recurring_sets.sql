-- Repeating sets: sets in the same series share series_id; recurrence holds the repeat rule
-- ({ "freq": "weekly" | "biweekly" | "monthly", "count": 12 } or { ..., "until": "2027-01-31" }).
-- Run once in Supabase → SQL Editor.

alter table public.sets
  add column if not exists series_id  uuid,
  add column if not exists recurrence jsonb;

create index if not exists sets_series_id_idx on public.sets (series_id);
