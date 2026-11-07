-- Remaining clinic identity fields.
-- Phone, address, timezone and appointment duration are already provisioned
-- by 20261107030000_clinic_settings.sql.
alter table public.clinics
  add column if not exists cnpj text,
  add column if not exists email text,
  add column if not exists logo_url text;

create unique index if not exists clinics_cnpj_unique_idx
  on public.clinics (regexp_replace(cnpj, '\\D', '', 'g'))
  where cnpj is not null
    and length(regexp_replace(cnpj, '\\D', '', 'g')) > 0;

drop policy if exists clinics_update_own_settings on public.clinics;
create policy clinics_update_own_settings on public.clinics
for update to authenticated
using (
  public.is_support()
  or (id = public.current_user_clinic_id() and public.has_permission('settings','edit'))
)
with check (
  public.is_support()
  or (id = public.current_user_clinic_id() and public.has_permission('settings','edit'))
);

grant update on public.clinics to authenticated;
