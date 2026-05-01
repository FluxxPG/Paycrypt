-- UPI rotation + manual handle pool
-- Date: 2026-05-01

begin;

-- 1) Allow storing future provider names without blocking schema evolution.
do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_name = 'upi_providers'
      and constraint_type = 'CHECK'
      and constraint_name = 'upi_providers_provider_name_check'
  ) then
    alter table upi_providers drop constraint upi_providers_provider_name_check;
  end if;
exception when undefined_table then
  -- ignore
end $$;

-- 2) Add rotation metadata to API-based providers
alter table upi_providers
  add column if not exists last_used_at timestamptz,
  add column if not exists usage_count bigint not null default 0;

-- 3) Manual UPI handle pool (multiple VPAs / QR payloads per merchant)
create table if not exists upi_manual_accounts (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  label text,
  vpa text not null,
  qr_payload text,
  priority integer not null default 1,
  is_active boolean not null default true,
  last_used_at timestamptz,
  usage_count bigint not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, vpa)
);

-- 4) Extend merchant UPI settings with rotation + refresh reroute controls
alter table merchant_upi_settings
  add column if not exists rotation_strategy text not null default 'round_robin',
  add column if not exists refresh_reroute_enabled boolean not null default true,
  add column if not exists max_reroutes integer not null default 3;

-- 5) Persist which VPA was used (for manual + UX display)
alter table payments
  add column if not exists upi_vpa text,
  add column if not exists upi_route_version integer not null default 0,
  add column if not exists upi_reroute_count integer not null default 0;

-- 6) Helpful indexes
create index if not exists upi_manual_accounts_merchant_active_idx
  on upi_manual_accounts (merchant_id, is_active, priority);
create index if not exists upi_manual_accounts_last_used_idx
  on upi_manual_accounts (merchant_id, last_used_at desc);
create index if not exists upi_providers_last_used_idx
  on upi_providers (merchant_id, last_used_at desc);

-- 7) updated_at triggers
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'upi_manual_accounts_updated_at'
  ) then
    create trigger upi_manual_accounts_updated_at
      before update on upi_manual_accounts
      for each row
      execute function update_updated_at_column();
  end if;
end $$;

commit;

