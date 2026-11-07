-- Private storage for patient photos. Only physician and secretary may access it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'patient-photos',
  'patient-photos',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "patient_photo_read_clinical_staff" on storage.objects;
create policy "patient_photo_read_clinical_staff" on storage.objects
for select to authenticated
using (bucket_id = 'patient-photos' and public.current_user_role() in ('medico', 'secretaria'));

drop policy if exists "patient_photo_insert_clinical_staff" on storage.objects;
create policy "patient_photo_insert_clinical_staff" on storage.objects
for insert to authenticated
with check (bucket_id = 'patient-photos' and public.current_user_role() in ('medico', 'secretaria'));

drop policy if exists "patient_photo_update_clinical_staff" on storage.objects;
create policy "patient_photo_update_clinical_staff" on storage.objects
for update to authenticated
using (bucket_id = 'patient-photos' and public.current_user_role() in ('medico', 'secretaria'))
with check (bucket_id = 'patient-photos' and public.current_user_role() in ('medico', 'secretaria'));

drop policy if exists "patient_photo_delete_clinical_staff" on storage.objects;
create policy "patient_photo_delete_clinical_staff" on storage.objects
for delete to authenticated
using (bucket_id = 'patient-photos' and public.current_user_role() in ('medico', 'secretaria'));
