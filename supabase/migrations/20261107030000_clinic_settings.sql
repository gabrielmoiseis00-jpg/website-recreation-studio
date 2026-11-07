-- Basic clinic settings, editable only by users with settings.edit or global support.
alter table public.clinics add column if not exists phone text not null default '';
alter table public.clinics add column if not exists address text not null default '';
alter table public.clinics add column if not exists timezone text not null default 'America/Rio_Branco';
alter table public.clinics add column if not exists appointment_duration_minutes integer not null default 30
  check (appointment_duration_minutes between 5 and 240);

drop trigger if exists clinics_set_updated_at on public.clinics;
create trigger clinics_set_updated_at before update on public.clinics
for each row execute function public.set_updated_at();

drop policy if exists clinics_manage_support on public.clinics;
create policy clinics_update_settings on public.clinics
for update to authenticated
using (public.is_support() or (id = public.current_user_clinic_id() and public.has_permission('settings','edit')))
with check (public.is_support() or (id = public.current_user_clinic_id() and public.has_permission('settings','edit')));

grant update on public.clinics to authenticated;
