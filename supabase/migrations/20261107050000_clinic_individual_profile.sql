-- Complete independent institutional settings for every tenant clinic.
alter table public.clinics
  add column if not exists cnpj text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists logo_url text,
  add column if not exists timezone text not null default 'America/Rio_Branco',
  add column if not exists appointment_duration_minutes integer not null default 30;

alter table public.clinics
  drop constraint if exists clinics_appointment_duration_check;
alter table public.clinics
  add constraint clinics_appointment_duration_check
  check (appointment_duration_minutes between 5 and 240);

create unique index if not exists clinics_cnpj_unique_idx
  on public.clinics (regexp_replace(cnpj, '\D', '', 'g'))
  where cnpj is not null and length(regexp_replace(cnpj, '\D', '', 'g')) > 0;

-- A clinic administrator may edit only their own institution settings.
drop policy if exists clinics_update_own_settings on public.clinics;
create policy clinics_update_own_settings on public.clinics
for update to authenticated
using (id = public.current_user_clinic_id() and public.has_permission('settings','edit'))
with check (id = public.current_user_clinic_id() and public.has_permission('settings','edit'));

comment on column public.clinics.cnpj is 'CNPJ belonging to this clinic; nullable for clinics that are not registered companies.';
comment on column public.clinics.logo_url is 'HTTPS URL for this clinic logo.';
