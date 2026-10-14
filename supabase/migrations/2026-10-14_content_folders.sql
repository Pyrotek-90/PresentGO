-- Content Library folders: users organise their imported PDFs and images into folders
-- (e.g. Announcements, Sermons › Oct 18). Folders can be nested.

create table if not exists public.media_folders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  parent_id  uuid references public.media_folders(id) on delete cascade,
  created_at timestamptz default now()
);

alter table public.media_folders enable row level security;

drop policy if exists "Users manage own media folders" on public.media_folders;
create policy "Users manage own media folders" on public.media_folders for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists media_folders_user_idx on public.media_folders (user_id);

-- Which folder a file is in (null = top level of the library).
alter table public.media_items
  add column if not exists folder_id uuid references public.media_folders(id) on delete set null;

create index if not exists media_items_folder_idx on public.media_items (folder_id);
