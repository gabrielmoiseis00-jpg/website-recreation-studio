-- Public clinic branding assets. Writes are restricted to the clinic's own folder
-- or to the global support role; reads are public because logos are public UI assets.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'clinic-logos',
  'clinic-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "clinic_logos_public_read" on storage.objects;
create policy "clinic_logos_public_read" on storage.objects
for select to public
using (bucket_id = 'clinic-logos');

drop policy if exists "clinic_logos_insert_own_clinic" on storage.objects;
create policy "clinic_logos_insert_own_clinic" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'clinic-logos'
  and (
    public.is_support()
    or (storage.foldername(name))[1] = public.current_user_clinic_id()::text
  )
);

drop policy if exists "clinic_logos_update_own_clinic" on storage.objects;
create policy "clinic_logos_update_own_clinic" on storage.objects
for update to authenticated
using (
  bucket_id = 'clinic-logos'
  and (
    public.is_support()
    or (storage.foldername(name))[1] = public.current_user_clinic_id()::text
  )
)
with check (
  bucket_id = 'clinic-logos'
  and (
    public.is_support()
    or (storage.foldername(name))[1] = public.current_user_clinic_id()::text
  )
);

drop policy if exists "clinic_logos_delete_own_clinic" on storage.objects;
create policy "clinic_logos_delete_own_clinic" on storage.objects
for delete to authenticated
using (
  bucket_id = 'clinic-logos'
  and (
    public.is_support()
    or (storage.foldername(name))[1] = public.current_user_clinic_id()::text
  )
);
