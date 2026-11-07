-- Granular per-user permissions for the ten clinic areas.
alter table public.profiles
  add column if not exists permissions jsonb not null default '{}'::jsonb;

create or replace function public.default_user_permissions(user_role text)
returns jsonb
language sql immutable
set search_path = public
as $$
  select case user_role
    when 'suporte' then '{
      "dashboard":{"view":true},
      "appointments":{"view":true,"create":true,"edit":true,"delete":true},
      "patients":{"view":true,"create":true,"edit":true,"delete":true},
      "medical_records":{"view":true,"create":true,"edit":true,"delete":true},
      "clinical_progress":{"view":true,"create":true,"edit":true,"delete":true},
      "finance":{"view":true,"create":true,"edit":true,"delete":true},
      "reports":{"view":true},
      "receipts":{"view":true,"create":true,"edit":true,"delete":true},
      "users":{"view":true,"create":true,"edit":true,"delete":true,"manage":true},
      "settings":{"view":true,"edit":true}
    }'::jsonb
    when 'medico' then '{
      "dashboard":{"view":true},
      "appointments":{"view":true,"create":true,"edit":true,"delete":true},
      "patients":{"view":true,"create":true,"edit":true,"delete":true},
      "medical_records":{"view":true,"create":true,"edit":true,"delete":true},
      "clinical_progress":{"view":true,"create":true,"edit":true,"delete":true},
      "finance":{"view":true,"create":true,"edit":true,"delete":true},
      "reports":{"view":true},
      "receipts":{"view":true,"create":true,"edit":true,"delete":true},
      "users":{"view":true,"create":true,"edit":true,"delete":true,"manage":true},
      "settings":{"view":true,"edit":true}
    }'::jsonb
    when 'secretaria' then '{
      "dashboard":{"view":true},
      "appointments":{"view":true,"create":true,"edit":true,"delete":true},
      "patients":{"view":true,"create":true,"edit":true,"delete":false},
      "medical_records":{"view":true,"create":false,"edit":false,"delete":false},
      "clinical_progress":{"view":true,"create":true,"edit":true,"delete":false},
      "finance":{"view":true,"create":true,"edit":true,"delete":false},
      "reports":{"view":false},
      "receipts":{"view":true,"create":true,"edit":true,"delete":true},
      "users":{"view":false,"create":false,"edit":false,"delete":false,"manage":false},
      "settings":{"view":false,"edit":false}
    }'::jsonb
    else '{
      "dashboard":{"view":true},
      "appointments":{"view":true,"create":true,"edit":true,"delete":false},
      "patients":{"view":true,"create":true,"edit":true,"delete":false},
      "medical_records":{"view":false,"create":false,"edit":false,"delete":false},
      "clinical_progress":{"view":false,"create":false,"edit":false,"delete":false},
      "finance":{"view":false,"create":false,"edit":false,"delete":false},
      "reports":{"view":false},
      "receipts":{"view":false,"create":false,"edit":false,"delete":false},
      "users":{"view":false,"create":false,"edit":false,"delete":false,"manage":false},
      "settings":{"view":false,"edit":false}
    }'::jsonb
  end
$$;

update public.profiles
set permissions = public.default_user_permissions(role)
where permissions = '{}'::jsonb;

create or replace function public.has_permission(area_key text, action_key text default 'view')
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active = true
      and (
        p.role = 'suporte'
        or coalesce((p.permissions #>> array[area_key, action_key])::boolean, false)
      )
  )
$$;

-- Apply the granular checks at the database boundary as well as in the interface.
drop policy if exists "patients_read_tenant" on public.patients;
drop policy if exists "patients_insert_tenant" on public.patients;
drop policy if exists "patients_update_tenant" on public.patients;
drop policy if exists "patients_delete_medico_or_support" on public.patients;
create policy "patients_read_permission" on public.patients for select to authenticated
using (public.is_support() or (public.has_permission('patients','view') and clinic_id = public.current_user_clinic_id()));
create policy "patients_insert_permission" on public.patients for insert to authenticated
with check (public.is_support() or (public.has_permission('patients','create') and clinic_id = public.current_user_clinic_id()));
create policy "patients_update_permission" on public.patients for update to authenticated
using (public.is_support() or (public.has_permission('patients','edit') and clinic_id = public.current_user_clinic_id()))
with check (public.is_support() or (public.has_permission('patients','edit') and clinic_id = public.current_user_clinic_id()));
create policy "patients_delete_permission" on public.patients for delete to authenticated
using (public.is_support() or (public.has_permission('patients','delete') and clinic_id = public.current_user_clinic_id()));

drop policy if exists "appointments_read_tenant" on public.appointments;
drop policy if exists "appointments_insert_tenant" on public.appointments;
drop policy if exists "appointments_update_tenant" on public.appointments;
drop policy if exists "appointments_delete_admin" on public.appointments;
create policy "appointments_read_permission" on public.appointments for select to authenticated
using (public.is_support() or (public.has_permission('appointments','view') and clinic_id = public.current_user_clinic_id()));
create policy "appointments_insert_permission" on public.appointments for insert to authenticated
with check (public.is_support() or (public.has_permission('appointments','create') and clinic_id = public.current_user_clinic_id()));
create policy "appointments_update_permission" on public.appointments for update to authenticated
using (public.is_support() or (public.has_permission('appointments','edit') and clinic_id = public.current_user_clinic_id()))
with check (public.is_support() or (public.has_permission('appointments','edit') and clinic_id = public.current_user_clinic_id()));
create policy "appointments_delete_permission" on public.appointments for delete to authenticated
using (public.is_support() or (public.has_permission('appointments','delete') and clinic_id = public.current_user_clinic_id()));

drop policy if exists "progress_read_tenant" on public.patient_weekly_progress;
drop policy if exists "progress_insert_tenant" on public.patient_weekly_progress;
drop policy if exists "progress_update_tenant" on public.patient_weekly_progress;
drop policy if exists "progress_delete_medico_or_support" on public.patient_weekly_progress;
create policy "progress_read_permission" on public.patient_weekly_progress for select to authenticated
using (public.is_support() or (public.has_permission('clinical_progress','view') and clinic_id = public.current_user_clinic_id()));
create policy "progress_insert_permission" on public.patient_weekly_progress for insert to authenticated
with check (public.is_support() or (public.has_permission('clinical_progress','create') and clinic_id = public.current_user_clinic_id()));
create policy "progress_update_permission" on public.patient_weekly_progress for update to authenticated
using (public.is_support() or (public.has_permission('clinical_progress','edit') and clinic_id = public.current_user_clinic_id()))
with check (public.is_support() or (public.has_permission('clinical_progress','edit') and clinic_id = public.current_user_clinic_id()));
create policy "progress_delete_permission" on public.patient_weekly_progress for delete to authenticated
using (public.is_support() or (public.has_permission('clinical_progress','delete') and clinic_id = public.current_user_clinic_id()));

drop policy if exists "finance_read_tenant" on public.appointment_finances;
drop policy if exists "finance_insert_tenant" on public.appointment_finances;
drop policy if exists "finance_update_tenant" on public.appointment_finances;
drop policy if exists "finance_delete_medico_or_support" on public.appointment_finances;
create policy "finance_read_permission" on public.appointment_finances for select to authenticated
using (public.is_support() or (public.has_permission('finance','view') and clinic_id = public.current_user_clinic_id()));
create policy "finance_insert_permission" on public.appointment_finances for insert to authenticated
with check (public.is_support() or (public.has_permission('finance','create') and clinic_id = public.current_user_clinic_id()));
create policy "finance_update_permission" on public.appointment_finances for update to authenticated
using (public.is_support() or (public.has_permission('finance','edit') and clinic_id = public.current_user_clinic_id()))
with check (public.is_support() or (public.has_permission('finance','edit') and clinic_id = public.current_user_clinic_id()));
create policy "finance_delete_permission" on public.appointment_finances for delete to authenticated
using (public.is_support() or (public.has_permission('finance','delete') and clinic_id = public.current_user_clinic_id()));

-- Receipts and patient images have separate storage controls.
drop policy if exists "tenant_receipts_access" on storage.objects;
create policy "tenant_receipts_access" on storage.objects for all to authenticated
using (bucket_id = 'appointment-receipts' and (
  public.is_support() or (
    (storage.foldername(name))[1] = public.current_user_clinic_id()::text
    and public.has_permission('receipts','view')
  )
))
with check (bucket_id = 'appointment-receipts' and (
  public.is_support() or (
    (storage.foldername(name))[1] = public.current_user_clinic_id()::text
    and public.has_permission('receipts','create')
  )
));

-- Patient photos follow patient permissions, not receipt permissions.
drop policy if exists "tenant_patient_photos_access" on storage.objects;
create policy "tenant_patient_photos_access" on storage.objects for all to authenticated
using (bucket_id = 'patient-photos' and (
  public.is_support() or (
    (storage.foldername(name))[1] = public.current_user_clinic_id()::text
    and public.has_permission('patients','view')
  )
))
with check (bucket_id = 'patient-photos' and (
  public.is_support() or (
    (storage.foldername(name))[1] = public.current_user_clinic_id()::text
    and public.has_permission('patients','edit')
  )
));

grant execute on function public.has_permission(text,text) to authenticated;
