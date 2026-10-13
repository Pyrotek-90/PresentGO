-- Storage bucket for Content Library slides, set presentations and loops.
-- Files live under <user id>/..., and each user can only write or delete their own folder.
-- Images only, up to 10 MB each (PDFs are turned into JPEG pages in the browser before upload).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media: upload own" on storage.objects;
create policy "media: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "media: update own" on storage.objects;
create policy "media: update own" on storage.objects for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "media: delete own" on storage.objects;
create policy "media: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "media: read" on storage.objects;
create policy "media: read" on storage.objects for select
  using (bucket_id = 'media');
