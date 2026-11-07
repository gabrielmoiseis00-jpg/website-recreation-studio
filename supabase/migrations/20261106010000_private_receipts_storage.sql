-- Private storage for appointment receipts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'appointment-receipts',
  'appointment-receipts',
  false,
  3145728,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 3145728,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "receipt_read_clinical_staff" on storage.objects;
create policy "receipt_read_clinical_staff" on storage.objects
for select to authenticated
using (
  bucket_id = 'appointment-receipts'
  and public.current_user_role() in ('medico', 'secretaria')
);

drop policy if exists "receipt_insert_clinical_staff" on storage.objects;
create policy "receipt_insert_clinical_staff" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'appointment-receipts'
  and public.current_user_role() in ('medico', 'secretaria')
);

drop policy if exists "receipt_update_clinical_staff" on storage.objects;
create policy "receipt_update_clinical_staff" on storage.objects
for update to authenticated
using (
  bucket_id = 'appointment-receipts'
  and public.current_user_role() in ('medico', 'secretaria')
)
with check (
  bucket_id = 'appointment-receipts'
  and public.current_user_role() in ('medico', 'secretaria')
);

drop policy if exists "receipt_delete_clinical_staff" on storage.objects;
create policy "receipt_delete_clinical_staff" on storage.objects
for delete to authenticated
using (
  bucket_id = 'appointment-receipts'
  and public.current_user_role() in ('medico', 'secretaria')
);
