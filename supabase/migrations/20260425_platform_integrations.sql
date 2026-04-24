create table if not exists platform_connections (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  platform text not null check (platform in ('shopify', 'woocommerce', 'wordpress', 'opencart')),
  store_domain text not null,
  store_name text not null,
  external_store_id text not null,
  status text not null default 'pending' check (status in ('pending', 'connected', 'syncing', 'error', 'disconnected', 'suspended')),
  capabilities jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, platform, store_domain)
);

create table if not exists integration_sync_logs (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references platform_connections(id) on delete cascade,
  merchant_id text not null references merchants(id) on delete cascade,
  event_type text not null,
  status text not null default 'success' check (status in ('success', 'failed', 'pending')),
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_connections_merchant_idx on platform_connections(merchant_id, updated_at desc);
create index if not exists platform_connections_platform_status_idx on platform_connections(platform, status, updated_at desc);
create index if not exists integration_sync_logs_connection_idx on integration_sync_logs(connection_id, created_at desc);
