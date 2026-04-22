create extension if not exists "pgcrypto";

create table if not exists merchants (
  id text primary key,
  name text not null,
  slug text not null unique,
  email text not null unique,
  status text not null default 'active',
  custodial_provider text not null default 'binance',
  custodial_enabled boolean not null default true,
  non_custodial_enabled boolean not null default false,
  webhook_base_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  merchant_id text not null references merchants(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('merchant', 'admin', 'super_admin')),
  created_at timestamptz not null default now()
);

create table if not exists refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  token text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  name text not null,
  key_type text not null check (key_type in ('public', 'secret')),
  key_prefix text not null,
  key_hash text not null,
  scopes text[] not null default '{}',
  is_active boolean not null default true,
  rate_limit_per_minute integer not null default 120,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists api_keys_lookup_idx on api_keys(key_prefix, key_type);
create unique index if not exists api_keys_unique_idx on api_keys(merchant_id, key_type, key_prefix);

create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  wallet_type text not null check (wallet_type in ('custodial', 'non_custodial')),
  provider text not null,
  asset text not null,
  network text not null,
  address text not null,
  is_active boolean not null default true,
  is_selected boolean not null default false,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists wallets_unique_idx on wallets(merchant_id, wallet_type, provider, asset, network, address);
create index if not exists wallets_merchant_created_idx on wallets(merchant_id, created_at desc);
create index if not exists wallets_payment_lookup_idx on wallets(payment_id, network, address);

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  plan_code text not null check (plan_code in ('starter', 'business', 'premium', 'custom')),
  status text not null default 'active',
  monthly_price_inr numeric(12,2) not null default 0,
  transaction_limit integer not null default 0,
  setup_fee_inr numeric(12,2) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists subscriptions_merchant_unique_idx on subscriptions(merchant_id);

create table if not exists billing_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  merchant_id text not null references merchants(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  plan_code text not null check (plan_code in ('starter', 'business', 'premium', 'custom')),
  status text not null default 'issued' check (status in ('issued', 'paid', 'overdue', 'void')),
  billing_period_start date not null,
  billing_period_end date not null,
  currency text not null default 'INR',
  subtotal_inr numeric(12,2) not null default 0,
  tax_inr numeric(12,2) not null default 0,
  total_inr numeric(12,2) not null default 0,
  paid_amount_inr numeric(12,2) not null default 0,
  due_at timestamptz not null,
  paid_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_invoices_merchant_created_idx on billing_invoices(merchant_id, created_at desc);
create index if not exists billing_invoices_status_idx on billing_invoices(status);

create table if not exists payments (
  id text primary key,
  merchant_id text not null references merchants(id) on delete cascade,
  amount_fiat numeric(18,2) not null,
  amount_crypto numeric(24,8) not null default 0,
  exchange_rate numeric(24,8) not null default 0,
  quote_source text not null default 'coingecko',
  quoted_at timestamptz not null default now(),
  fiat_currency text not null,
  settlement_currency text not null,
  network text not null,
  customer_email text,
  customer_name text,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  wallet_routes jsonb not null default '{}'::jsonb,
  wallet_address text not null,
  status text not null default 'created',
  confirmations integer not null default 0,
  tx_hash text,
  expires_at timestamptz not null,
  success_url text not null,
  cancel_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payments_merchant_created_idx on payments(merchant_id, created_at desc);
create index if not exists payments_status_idx on payments(status);

alter table if exists wallets
  add column if not exists payment_id text references payments(id) on delete set null;

create table if not exists payment_links (
  id text primary key,
  merchant_id text not null references merchants(id) on delete cascade,
  title text not null,
  description text not null,
  amount_fiat numeric(18,2) not null,
  fiat_currency text not null,
  settlement_currency text not null,
  network text not null,
  success_url text not null,
  cancel_url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id uuid primary key default gen_random_uuid(),
  payment_id text not null references payments(id) on delete cascade,
  merchant_id text not null references merchants(id) on delete cascade,
  asset text not null,
  network text not null,
  amount_crypto numeric(24,8) not null,
  amount_fiat numeric(18,2) not null,
  tx_hash text not null,
  confirmations integer not null default 0,
  status text not null default 'pending',
  source_type text not null default 'payment',
  created_at timestamptz not null default now()
);

create index if not exists transactions_merchant_created_idx on transactions(merchant_id, created_at desc);
create unique index if not exists transactions_payment_unique_idx on transactions(payment_id);
create index if not exists transactions_payment_status_idx on transactions(payment_id, status);

create table if not exists settlements (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  payment_id text not null references payments(id) on delete cascade,
  transaction_id uuid references transactions(id) on delete set null,
  provider text not null,
  asset text not null,
  network text not null,
  amount_crypto numeric(24,8) not null,
  amount_fiat numeric(18,2) not null,
  tx_hash text not null,
  status text not null default 'processed' check (status in ('pending', 'processed', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists settlements_payment_unique_idx on settlements(payment_id);
create index if not exists settlements_merchant_created_idx on settlements(merchant_id, created_at desc);
create index if not exists settlements_payment_status_idx on settlements(payment_id, status);

create or replace view payment_ledger as
select
  p.id,
  p.merchant_id,
  p.amount_fiat,
  p.amount_crypto as quoted_amount_crypto,
  coalesce(t.amount_crypto, p.amount_crypto) as received_amount_crypto,
  p.exchange_rate,
  p.fiat_currency,
  p.settlement_currency,
  p.network,
  p.customer_email,
  p.customer_name,
  p.description,
  p.status as payment_status,
  coalesce(
    t.status,
    case
      when p.status in ('pending', 'confirmed', 'failed', 'expired') then p.status
      else 'created'
    end
  ) as transaction_status,
  case
    when s.status = 'processed' then 'settled'
    when s.status = 'pending' then 'processing'
    when s.status = 'failed' then 'settlement_failed'
    when p.status = 'confirmed' then 'unsettled'
    when p.status = 'failed' then 'not_settled'
    when p.status = 'expired' then 'expired'
    else 'awaiting_confirmation'
  end as settlement_state,
  s.status as settlement_status,
  coalesce(t.confirmations, p.confirmations) as confirmations,
  coalesce(t.tx_hash, p.tx_hash) as tx_hash,
  p.wallet_address,
  coalesce(w.provider, ((p.wallet_routes -> p.network) ->> 'provider'), 'binance') as wallet_provider,
  coalesce(w.wallet_type, ((p.wallet_routes -> p.network) ->> 'walletType'), 'custodial') as wallet_type,
  ((p.wallet_routes -> p.network) ->> 'sourceWalletId') as source_wallet_id,
  s.provider as settlement_provider,
  s.processed_at as settled_at,
  t.created_at as transaction_created_at,
  s.created_at as settlement_created_at,
  p.created_at,
  p.updated_at
from payments p
left join transactions t on t.payment_id = p.id
left join settlements s on s.payment_id = p.id
left join wallets w
  on w.payment_id = p.id
 and w.network = p.network
 and w.address = p.wallet_address;

create table if not exists webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  target_url text not null,
  events text[] not null default '{}',
  is_active boolean not null default true,
  secret_hash text not null,
  secret_ciphertext text not null,
  secret_version integer not null default 1,
  last_rotated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists webhook_logs (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  endpoint_id uuid references webhook_endpoints(id) on delete set null,
  event_type text not null,
  payload jsonb not null,
  response_status integer,
  attempt integer not null default 1,
  delivered_at timestamptz,
  next_retry_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists usage_logs (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  event_type text not null,
  quantity integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists usage_logs_merchant_created_idx on usage_logs(merchant_id, created_at desc);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id text not null,
  merchant_id text references merchants(id) on delete cascade,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists worker_heartbeats (
  id uuid primary key default gen_random_uuid(),
  worker_name text not null,
  status text not null default 'online',
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists worker_heartbeats_name_idx on worker_heartbeats(worker_name);

create table if not exists non_custodial_wallet_verifications (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  wallet_address text not null,
  asset text not null,
  network text not null,
  challenge_message text not null,
  signature text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

create index if not exists non_custodial_wallet_verifications_idx on non_custodial_wallet_verifications(merchant_id, wallet_address);

create table if not exists system_alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null,
  source text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists system_alerts_created_idx on system_alerts(created_at desc);

create table if not exists ws_health (
  id uuid primary key default gen_random_uuid(),
  node_id text not null,
  clients_connected integer not null default 0,
  latency_ms integer not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists ws_health_node_idx on ws_health(node_id);

insert into merchants (id, name, slug, email, non_custodial_enabled)
values
  ('mrc_demo', 'Nebula Commerce', 'nebula-commerce', 'owner@nebula.dev', false),
  ('mrc_admin', 'Platform Admin', 'platform-admin', 'admin@cryptopay.dev', true)
on conflict (id) do nothing;

insert into subscriptions (merchant_id, plan_code, monthly_price_inr, transaction_limit, setup_fee_inr)
values
  ('mrc_demo', 'business', 15000, 20000, 0),
  ('mrc_admin', 'premium', 35000, 100000, 0)
on conflict do nothing;
