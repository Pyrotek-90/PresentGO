-- ============================================================
-- PresentGO — Supabase Database Schema
-- Run this in your Supabase project → SQL Editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ────────────────────────────────────────────────────────────
-- SONGS
-- ────────────────────────────────────────────────────────────
create table public.songs (
  id              uuid primary key default uuid_generate_v4(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text not null,
  artist          text,
  ccli_number     text,
  raw_lyrics      text,
  slides          jsonb default '[]'::jsonb,  -- formatted slide array
  lines_per_slide int  default 2,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.songs enable row level security;

create policy "Users manage own songs"
  on public.songs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- SETS (service set lists)
-- ────────────────────────────────────────────────────────────
create table public.sets (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  service_date date,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table public.sets enable row level security;

create policy "Users manage own sets"
  on public.sets for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- SET ITEMS (ordered items within a set)
-- ────────────────────────────────────────────────────────────
create table public.set_items (
  id         uuid primary key default uuid_generate_v4(),
  set_id     uuid not null references public.sets(id) on delete cascade,
  type       text not null check (type in ('song','welcome','announcement','blank','media')),
  content    jsonb default '{}'::jsonb,
  position   int  not null default 0,
  created_at timestamptz default now()
);

alter table public.set_items enable row level security;

-- Users can manage items for sets they own
create policy "Users manage items in own sets"
  on public.set_items for all
  using (
    exists (
      select 1 from public.sets
      where sets.id = set_items.set_id
        and sets.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.sets
      where sets.id = set_items.set_id
        and sets.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────
-- MEDIA ITEMS (Content Library — files uploaded by user)
-- ────────────────────────────────────────────────────────────
-- type values:
--   'image'        — uploaded or imported image (JPEG, PNG, WebP, GIF)
--   'presentation' — PowerPoint, Keynote, PDF, or Google Slides
--   'loop'         — slideshow loop; images stored as JSONB in metadata
--
-- metadata JSONB structure for loops:
--   { "duration": <seconds>, "images": [{ "id", "name", "url", "storage_path" }] }
-- ────────────────────────────────────────────────────────────
create table public.media_items (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  type         text not null default 'image'
                 check (type in ('image', 'presentation', 'loop')),
  storage_path text,                    -- path inside the 'media' storage bucket (null for loops)
  url          text,                    -- public URL of the file (null for loops)
  metadata     jsonb default null,      -- extra data; used by loops: { duration, images[] }

  -- Legacy columns kept for backward compatibility with any existing rows.
  -- New code uses type / storage_path / url / metadata instead.
  category     text,
  file_path    text,
  file_size    bigint,
  mime_type    text,
  source       text,
  external_url text,

  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table public.media_items enable row level security;

create policy "Users manage own media"
  on public.media_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- STORAGE BUCKET (run once after creating 'media' bucket)
-- ────────────────────────────────────────────────────────────
-- In the Supabase Dashboard → Storage, create a bucket named 'media' and set it to Public.
-- Then run the policies below in the SQL Editor:
--
-- insert into storage.buckets (id, name, public) values ('media', 'media', true);
--
-- create policy "Users upload own media" on storage.objects for insert
--   with check (auth.uid()::text = (storage.foldername(name))[1]);
--
-- create policy "Users read own media" on storage.objects for select
--   using (auth.uid()::text = (storage.foldername(name))[1]);
--
-- create policy "Users delete own media" on storage.objects for delete
--   using (auth.uid()::text = (storage.foldername(name))[1]);

-- ────────────────────────────────────────────────────────────
-- MIGRATION: add new columns to existing media_items table
-- Run this block if you already have a media_items table
-- created from an earlier version of this schema:
-- ────────────────────────────────────────────────────────────
-- alter table public.media_items
--   add column if not exists type         text not null default 'image'
--     check (type in ('image', 'presentation', 'loop')),
--   add column if not exists storage_path text,
--   add column if not exists url          text,
--   add column if not exists metadata     jsonb default null;
--
-- -- Migrate existing rows: copy file_path → storage_path, category → type
-- update public.media_items
--   set storage_path = file_path,
--       type = case
--         when category in ('image','presentation','loop') then category
--         else 'image'
--       end
--   where storage_path is null;

-- ────────────────────────────────────────────────────────────
-- AUTO-UPDATE updated_at
-- ────────────────────────────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger songs_updated_at before update on public.songs
  for each row execute function public.handle_updated_at();

create trigger sets_updated_at before update on public.sets
  for each row execute function public.handle_updated_at();

create trigger media_items_updated_at before update on public.media_items
  for each row execute function public.handle_updated_at();
