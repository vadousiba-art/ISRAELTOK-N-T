-- ============================================================================
-- Media storage (Supabase only — demo mode stores files on local disk).
--
-- The bucket is private. Members read media through /api/media/..., which
-- checks the session and redirects to a short-lived signed URL.
-- Uploads only happen through signed upload URLs that the server issues after
-- validating type, size and the per-user upload rate limit, so there is no
-- INSERT policy for regular users.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', false, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "itn members read media" on storage.objects;
create policy "itn members read media" on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_member());
