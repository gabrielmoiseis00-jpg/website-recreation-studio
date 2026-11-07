-- Dedicated clinical records with clinic isolation and granular permissions.
create table if not exists public.medical_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  title text not null,
  content text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint medical_records_title_not_empty check (length(trim(title)) > 0)
);

create index if not exists medical_records_clinic_patient_idx
  on public.medical_records(clinic_id, patient_id, created_at desc);

drop trigger if exists medical_records_set_updated_at on public.medical_records;
create trigger medical_records_set_updated_at before update on public.medical_records
for each row execute function public.set_updated_at();

create or replace function public.assign_medical_record_clinic()
returns trigger language plpgsql security definer
set search_path = public
as $$
declare
  patient_clinic uuid;
begin
  select clinic_id into patient_clinic
  from public.patients where id = new.patient_id;

  if patient_clinic is null then
    raise exception 'Paciente não encontrado';
  end if;

  if tg_op = 'INSERT' then
    if public.is_support() then
      if new.clinic_id is null then
        raise exception 'Informe a clínica para cadastrar o prontuário';
      end if;
    else
      new.clinic_id := public.current_user_clinic_id();
    end if;
  else
    if new.patient_id is distinct from old.patient_id or new.clinic_id is distinct from old.clinic_id then
      raise exception 'Não é permitido transferir prontuários entre pacientes ou clínicas';
    end if;
    new.clinic_id := old.clinic_id;
  end if;

  if new.clinic_id is distinct from patient_clinic then
    raise exception 'O paciente pertence a outra clínica';
  end if;
  return new;
end;
$$;

drop trigger if exists medical_records_assign_clinic on public.medical_records;
create trigger medical_records_assign_clinic before insert or update on public.medical_records
for each row execute function public.assign_medical_record_clinic();

alter table public.medical_records enable row level security;
drop policy if exists medical_records_read_permission on public.medical_records;
drop policy if exists medical_records_insert_permission on public.medical_records;
drop policy if exists medical_records_update_permission on public.medical_records;
drop policy if exists medical_records_delete_permission on public.medical_records;

create policy medical_records_read_permission on public.medical_records
for select to authenticated using (
  public.is_support()
  or (clinic_id = public.current_user_clinic_id() and public.has_permission('medical_records','view'))
);
create policy medical_records_insert_permission on public.medical_records
for insert to authenticated with check (
  (public.is_support() and clinic_id is not null)
  or (clinic_id = public.current_user_clinic_id() and public.has_permission('medical_records','create'))
);
create policy medical_records_update_permission on public.medical_records
for update to authenticated
using (public.is_support() or (clinic_id = public.current_user_clinic_id() and public.has_permission('medical_records','edit')))
with check (public.is_support() or (clinic_id = public.current_user_clinic_id() and public.has_permission('medical_records','edit')));
create policy medical_records_delete_permission on public.medical_records
for delete to authenticated using (
  public.is_support()
  or (clinic_id = public.current_user_clinic_id() and public.has_permission('medical_records','delete'))
);

grant select, insert, update, delete on public.medical_records to authenticated;
