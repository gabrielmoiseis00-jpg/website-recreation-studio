-- Reports are read-only and must still respect clinic boundaries.
drop policy if exists appointments_read_permission on public.appointments;
create policy appointments_read_permission on public.appointments for select to authenticated
using (
  public.is_support()
  or (
    clinic_id = public.current_user_clinic_id()
    and (
      public.has_permission('appointments','view')
      or public.has_permission('finance','view')
      or public.has_permission('clinical_progress','view')
      or public.has_permission('reports','view')
      or public.has_permission('dashboard','view')
    )
  )
);
