-- Multi-tenant clinics, support role, and tenant isolation.
-- Apply only after reviewing the migration. Existing records are assigned to the
-- first clinic created for the existing physician account.

create table if not exists public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists clinic_id uuid references public.clinics(id) on delete restrict;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('suporte', 'medico', 'secretaria', 'aplicacao'));

insert into public.clinics (name)
select 'Consultório Dr. Ricardo'
where not exists (select 1 from public.clinics)
  and exists (select 1 from public.profiles where role = 'medico');

update public.profiles
set clinic_id = (select id from public.clinics order by created_at, id limit 1)
where role <> 'suporte' and clinic_id is null;

alter table public.patients add column if not exists clinic_id uuid references public.clinics(id) on delete cascade;
alter table public.appointments add column if not exists clinic_id uuid references public.clinics(id) on delete cascade;
alter table public.patient_weekly_progress add column if not exists clinic_id uuid references public.clinics(id) on delete cascade;
alter table public.appointment_finances add column if not exists clinic_id uuid references public.clinics(id) on delete cascade;

update public.patients
set clinic_id = (select id from public.clinics order by created_at, id limit 1)
where clinic_id is null;

update public.appointments
set clinic_id = (select id from public.clinics order by created_at, id limit 1)
where clinic_id is null;

update public.patient_weekly_progress p
set clinic_id = a.clinic_id
from public.appointments a
where p.appointment_id = a.id and p.clinic_id is null;

update public.appointment_finances f
set clinic_id = a.clinic_id
from public.appointments a
where f.appointment_id = a.id and f.clinic_id is null;

alter table public.patients alter column clinic_id set not null;
alter table public.appointments alter column clinic_id set not null;
alter table public.patient_weekly_progress alter column clinic_id set not null;
alter table public.appointment_finances alter column clinic_id set not null;

create index if not exists profiles_clinic_id_idx on public.profiles(clinic_id);
create index if not exists patients_clinic_id_idx on public.patients(clinic_id);
create index if not exists appointments_clinic_date_idx on public.appointments(clinic_id, appointment_date, appointment_time);
create index if not exists progress_clinic_id_idx on public.patient_weekly_progress(clinic_id);
create index if not exists finances_clinic_id_idx on public.appointment_finances(clinic_id);

create or replace function public.is_support()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true and role = 'suporte'
  )
$$;

create or replace function public.current_user_clinic_id()
returns uuid language sql stable security definer
set search_path = public
as $$
  select clinic_id from public.profiles
  where id = auth.uid() and active = true
$$;

create or replace function public.assign_row_clinic()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if public.current_user_role() = 'suporte' then
      if new.clinic_id is null then
        raise exception 'Suporte deve informar o consultório para criar registros clínicos';
      end if;
    else
      new.clinic_id := public.current_user_clinic_id();
    end if;
    if new.clinic_id is null then
      raise exception 'Usuário sem consultório vinculado';
    end if;
  else
    if new.clinic_id is distinct from old.clinic_id then
      raise exception 'Não é permitido mover registros entre consultórios';
    end if;
    new.clinic_id := old.clinic_id;
  end if;
  return new;
end;
$$;

drop trigger if exists patients_assign_clinic on public.patients;
create trigger patients_assign_clinic before insert or update on public.patients
for each row execute function public.assign_row_clinic();

drop trigger if exists appointments_assign_clinic on public.appointments;
create trigger appointments_assign_clinic before insert or update on public.appointments
for each row execute function public.assign_row_clinic();

create or replace function public.assign_child_row_clinic()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  parent_clinic uuid;
begin
  select clinic_id into parent_clinic
  from public.appointments
  where id = new.appointment_id;

  if parent_clinic is null then
    raise exception 'Agendamento não encontrado';
  end if;
  if public.current_user_role() <> 'suporte'
     and parent_clinic <> public.current_user_clinic_id() then
    raise exception 'Agendamento pertence a outro consultório';
  end if;
  new.clinic_id := parent_clinic;
  return new;
end;
$$;

drop trigger if exists progress_assign_clinic on public.patient_weekly_progress;
create trigger progress_assign_clinic before insert or update on public.patient_weekly_progress
for each row execute function public.assign_child_row_clinic();

drop trigger if exists finances_assign_clinic on public.appointment_finances;
create trigger finances_assign_clinic before insert or update on public.appointment_finances
for each row execute function public.assign_child_row_clinic();

create or replace function public.current_user_role()
returns text language sql stable security definer
set search_path = public
as $$
  select role from public.profiles
  where id = auth.uid() and active = true
$$;

-- Replace the original cross-clinic policies with tenant-aware policies.
drop policy if exists "profile_read_self_or_physician" on public.profiles;
drop policy if exists "patients_read_active" on public.patients;
drop policy if exists "patients_insert_active" on public.patients;
drop policy if exists "patients_update_active" on public.patients;
drop policy if exists "patients_delete_physician" on public.patients;
drop policy if exists "appointments_read_active" on public.appointments;
drop policy if exists "appointments_insert_active" on public.appointments;
drop policy if exists "appointments_update_active" on public.appointments;
drop policy if exists "appointments_delete_admin" on public.appointments;
drop policy if exists "progress_read_clinical_staff" on public.patient_weekly_progress;
drop policy if exists "progress_insert_clinical_staff" on public.patient_weekly_progress;
drop policy if exists "progress_update_clinical_staff" on public.patient_weekly_progress;
drop policy if exists "progress_delete_physician" on public.patient_weekly_progress;
drop policy if exists "finance_read_admin" on public.appointment_finances;
drop policy if exists "finance_insert_admin" on public.appointment_finances;
drop policy if exists "finance_update_admin" on public.appointment_finances;
drop policy if exists "finance_delete_physician" on public.appointment_finances;

alter table public.clinics enable row level security;

create policy "clinics_read_support_or_members" on public.clinics
for select to authenticated
using (public.is_support() or id = public.current_user_clinic_id());

create policy "clinics_manage_support" on public.clinics
for all to authenticated
using (public.is_support())
with check (public.is_support());

create policy "profiles_read_tenant_or_support" on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or public.is_support()
  or (clinic_id is not null and clinic_id = public.current_user_clinic_id())
);

create policy "patients_tenant_access" on public.patients
for all to authenticated
using (public.is_support() or (public.is_active_user() and clinic_id = public.current_user_clinic_id()))
with check (public.is_support() or (public.is_active_user() and clinic_id = public.current_user_clinic_id()));

create policy "appointments_tenant_access" on public.appointments
for all to authenticated
using (public.is_support() or (public.is_active_user() and clinic_id = public.current_user_clinic_id()))
with check (public.is_support() or (public.is_active_user() and clinic_id = public.current_user_clinic_id()));

create policy "progress_tenant_clinical_access" on public.patient_weekly_progress
for all to authenticated
using (
  public.is_support()
  or (clinic_id = public.current_user_clinic_id() and public.current_user_role() in ('medico', 'secretaria'))
)
with check (
  public.is_support()
  or (clinic_id = public.current_user_clinic_id() and public.current_user_role() in ('medico', 'secretaria'))
);

create policy "finance_tenant_clinical_access" on public.appointment_finances
for all to authenticated
using (
  public.is_support()
  or (clinic_id = public.current_user_clinic_id() and public.current_user_role() in ('medico', 'secretaria'))
)
with check (
  public.is_support()
  or (clinic_id = public.current_user_clinic_id() and public.current_user_role() in ('medico', 'secretaria'))
);

grant select on public.clinics to authenticated;

-- Storage objects are stored under <clinic_uuid>/<file_name>.
drop policy if exists "receipt_read_clinical_staff" on storage.objects;
drop policy if exists "receipt_insert_clinical_staff" on storage.objects;
drop policy if exists "receipt_update_clinical_staff" on storage.objects;
drop policy if exists "receipt_delete_clinical_staff" on storage.objects;
drop policy if exists "patient_photo_read_clinical_staff" on storage.objects;
drop policy if exists "patient_photo_insert_clinical_staff" on storage.objects;
drop policy if exists "patient_photo_update_clinical_staff" on storage.objects;
drop policy if exists "patient_photo_delete_clinical_staff" on storage.objects;

create policy "tenant_receipts_access" on storage.objects
for all to authenticated
using (
  bucket_id = 'appointment-receipts'
  and (
    public.is_support()
    or (
      public.current_user_role() in ('medico', 'secretaria')
      and (storage.foldername(name))[1] = public.current_user_clinic_id()::text
    )
  )
)
with check (
  bucket_id = 'appointment-receipts'
  and (
    public.is_support()
    or (
      public.current_user_role() in ('medico', 'secretaria')
      and (storage.foldername(name))[1] = public.current_user_clinic_id()::text
    )
  )
);

create policy "tenant_patient_photos_access" on storage.objects
for all to authenticated
using (
  bucket_id = 'patient-photos'
  and (
    public.is_support()
    or (
      public.current_user_role() in ('medico', 'secretaria')
      and (storage.foldername(name))[1] = public.current_user_clinic_id()::text
    )
  )
)
with check (
  bucket_id = 'patient-photos'
  and (
    public.is_support()
    or (
      public.current_user_role() in ('medico', 'secretaria')
      and (storage.foldername(name))[1] = public.current_user_clinic_id()::text
    )
  )
);
