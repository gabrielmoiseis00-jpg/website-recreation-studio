-- Append-only audit ledger for future clinic backup/deletion workflows.
-- This migration does NOT delete clinics, patient data, Auth users, or Storage objects.
-- Audit rows intentionally have no foreign keys to clinics/auth.users so they survive deletion.

create table if not exists public.clinic_deletion_audit_events (
  id uuid primary key default gen_random_uuid(),
  operation_id uuid not null,
  clinic_id uuid not null,
  clinic_name text not null,
  actor_user_id uuid not null,
  actor_username text not null,
  event_type text not null check (event_type in (
    'preflight_completed',
    'backup_started',
    'backup_created',
    'backup_verified',
    'retention_reviewed',
    'deletion_started',
    'storage_cleanup_completed',
    'database_cleanup_completed',
    'auth_cleanup_completed',
    'deletion_completed',
    'deletion_failed',
    'deletion_cancelled'
  )),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists clinic_deletion_audit_operation_idx
  on public.clinic_deletion_audit_events (operation_id, created_at);

create index if not exists clinic_deletion_audit_clinic_idx
  on public.clinic_deletion_audit_events (clinic_id, created_at desc);

alter table public.clinic_deletion_audit_events enable row level security;

-- No browser role may read or write the audit ledger directly.
revoke all on public.clinic_deletion_audit_events from public, anon, authenticated;
grant select, insert on public.clinic_deletion_audit_events to service_role;

-- Make the ledger append-only, including for service-role application code.
create or replace function public.prevent_clinic_deletion_audit_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'O histórico de auditoria é imutável; apenas novos eventos podem ser registrados.';
end;
$$;

drop trigger if exists clinic_deletion_audit_no_update on public.clinic_deletion_audit_events;
create trigger clinic_deletion_audit_no_update
before update or delete on public.clinic_deletion_audit_events
for each row execute function public.prevent_clinic_deletion_audit_mutation();

comment on table public.clinic_deletion_audit_events is
  'Registro append-only de operações futuras de backup/exclusão de consultórios. Não armazena dados clínicos, credenciais ou tokens.';
comment on column public.clinic_deletion_audit_events.details is
  'Somente metadados operacionais não sensíveis: contagens, tamanhos, checksum, caminho de backup e códigos de resultado. Nunca incluir conteúdo de prontuários, nomes de pacientes, senhas ou tokens.';
