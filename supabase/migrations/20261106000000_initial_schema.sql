-- Initial Supabase schema for Consultório Dr. Ricardo.
-- Apply only after reviewing the access matrix in docs/SUPABASE_SETUP.md.
-- This migration does not create Auth users; users must be provisioned securely.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  role text not null check (role in ('medico', 'secretaria', 'aplicacao')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text not null,
  email text not null,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  appointment_date date not null,
  appointment_time time not null,
  notes text not null default '',
  status text not null default 'agendado'
    check (status in ('agendado', 'confirmado', 'concluido', 'cancelado')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.patient_weekly_progress (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  week_number smallint not null check (week_number between 1 and 4),
  medications jsonb not null default '[]'::jsonb,
  observations text not null default '',
  updated_at timestamptz not null default now(),
  unique (appointment_id, week_number)
);

create table if not exists public.appointment_finances (
  appointment_id uuid primary key references public.appointments(id) on delete cascade,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  payment_status text not null default 'aguardando'
    check (payment_status in ('pago', 'nao_pago', 'aguardando')),
  payment_method text not null default ''
    check (payment_method in ('', 'pix', 'dinheiro', 'credito', 'debito', 'boleto', 'convenio', 'transferencia')),
  payment_date date,
  receipt_path text,
  receipt_name text,
  updated_at timestamptz not null default now()
);

create index if not exists appointments_date_time_idx
  on public.appointments (appointment_date, appointment_time);
create index if not exists patients_name_idx on public.patients (full_name);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists patients_set_updated_at on public.patients;
create trigger patients_set_updated_at before update on public.patients
for each row execute function public.set_updated_at();
drop trigger if exists appointments_set_updated_at on public.appointments;
create trigger appointments_set_updated_at before update on public.appointments
for each row execute function public.set_updated_at();
drop trigger if exists progress_set_updated_at on public.patient_weekly_progress;
create trigger progress_set_updated_at before update on public.patient_weekly_progress
for each row execute function public.set_updated_at();
drop trigger if exists finances_set_updated_at on public.appointment_finances;
create trigger finances_set_updated_at before update on public.appointment_finances
for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns text language sql stable security definer
set search_path = public
as $$
  select role from public.profiles
  where id = auth.uid() and active = true
$$;

create or replace function public.is_active_user()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true
  )
$$;

alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.appointments enable row level security;
alter table public.patient_weekly_progress enable row level security;
alter table public.appointment_finances enable row level security;

-- Users can read their own profile; only the physician can list all profiles.
create policy "profile_read_self_or_physician" on public.profiles
for select to authenticated
using (id = auth.uid() or public.current_user_role() = 'medico');

-- Profile role changes are not allowed from the browser. Provisioning is a server-side task.
create policy "patients_read_active" on public.patients
for select to authenticated using (public.is_active_user());
create policy "patients_insert_active" on public.patients
for insert to authenticated with check (public.is_active_user());
create policy "patients_update_active" on public.patients
for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "patients_delete_physician" on public.patients
for delete to authenticated using (public.current_user_role() = 'medico');

create policy "appointments_read_active" on public.appointments
for select to authenticated using (public.is_active_user());
create policy "appointments_insert_active" on public.appointments
for insert to authenticated with check (public.is_active_user());
create policy "appointments_update_active" on public.appointments
for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "appointments_delete_admin" on public.appointments
for delete to authenticated using (public.current_user_role() in ('medico', 'secretaria'));

-- Medication/progress notes are restricted to physician and secretary, not application staff.
create policy "progress_read_clinical_staff" on public.patient_weekly_progress
for select to authenticated
using (public.current_user_role() in ('medico', 'secretaria'));
create policy "progress_insert_clinical_staff" on public.patient_weekly_progress
for insert to authenticated
with check (public.current_user_role() in ('medico', 'secretaria'));
create policy "progress_update_clinical_staff" on public.patient_weekly_progress
for update to authenticated
using (public.current_user_role() in ('medico', 'secretaria'))
with check (public.current_user_role() in ('medico', 'secretaria'));
create policy "progress_delete_physician" on public.patient_weekly_progress
for delete to authenticated
using (public.current_user_role() = 'medico');

-- Financial data is limited to physician and secretary.
create policy "finance_read_admin" on public.appointment_finances
for select to authenticated
using (public.current_user_role() in ('medico', 'secretaria'));
create policy "finance_insert_admin" on public.appointment_finances
for insert to authenticated
with check (public.current_user_role() in ('medico', 'secretaria'));
create policy "finance_update_admin" on public.appointment_finances
for update to authenticated
using (public.current_user_role() in ('medico', 'secretaria'))
with check (public.current_user_role() in ('medico', 'secretaria'));
create policy "finance_delete_physician" on public.appointment_finances
for delete to authenticated
using (public.current_user_role() = 'medico');

-- Explicit grants: new tables are not automatically exposed to API roles.
grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on public.patients to authenticated;
grant select, insert, update, delete on public.appointments to authenticated;
grant select, insert, update, delete on public.patient_weekly_progress to authenticated;
grant select, insert, update, delete on public.appointment_finances to authenticated;
