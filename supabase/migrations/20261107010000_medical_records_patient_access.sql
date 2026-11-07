-- Clinical-record users need patient names to select the correct chart.
drop policy if exists patients_read_permission on public.patients;
create policy patients_read_permission on public.patients for select to authenticated
using (
  public.is_support()
  or (
    clinic_id = public.current_user_clinic_id()
    and (
      public.has_permission('patients','view')
      or public.has_permission('appointments','view')
      or public.has_permission('finance','view')
      or public.has_permission('clinical_progress','view')
      or public.has_permission('medical_records','view')
    )
  )
);
