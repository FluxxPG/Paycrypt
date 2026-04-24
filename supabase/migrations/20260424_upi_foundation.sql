alter table subscriptions
  add column if not exists upi_enabled boolean not null default false,
  add column if not exists upi_provider_limit integer not null default 0;

update subscriptions
set
  upi_enabled = case
    when plan_code in ('custom_selective', 'custom_enterprise') then true
    else false
  end,
  upi_provider_limit = case
    when plan_code = 'custom_enterprise' then -1
    when plan_code = 'custom_selective' then 1
    else 0
  end;

alter table merchants
  add column if not exists upi_default_amount_fiat numeric(18,2) not null default 999,
  add column if not exists crypto_default_amount_fiat numeric(18,2) not null default 2499,
  add column if not exists upi_manual_vpa text,
  add column if not exists upi_manual_qr_url text,
  add column if not exists upi_manual_mode_enabled boolean not null default false;

alter table payments
  add column if not exists payment_method text not null default 'crypto',
  add column if not exists upi_provider text,
  add column if not exists upi_transaction_id text,
  add column if not exists upi_intent_url text,
  add column if not exists upi_qr_code text,
  add column if not exists upi_status text,
  add column if not exists provider_response jsonb not null default '{}'::jsonb,
  add column if not exists transaction_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_payment_method_check'
  ) then
    alter table payments
      add constraint payments_payment_method_check check (payment_method in ('crypto', 'upi'));
  end if;
end $$;

create table if not exists merchant_upi_settings (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null unique references merchants(id) on delete cascade,
  upi_enabled boolean not null default false,
  auto_routing_enabled boolean not null default true,
  fallback_to_manual boolean not null default false,
  allowed_providers text[] not null default array['phonepe','paytm','razorpay','freecharge'],
  provider_priority jsonb not null default '{"phonepe":1,"paytm":2,"razorpay":3,"freecharge":4}'::jsonb,
  webhook_secret_encrypted text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists upi_providers (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  provider_name text not null check (provider_name in ('phonepe', 'paytm', 'razorpay', 'freecharge')),
  api_key_encrypted text not null,
  secret_key_encrypted text not null,
  environment text not null default 'test' check (environment in ('test', 'production')),
  priority integer not null default 1,
  is_active boolean not null default true,
  is_tested boolean not null default false,
  test_status text,
  last_tested_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id, provider_name)
);

create table if not exists upi_webhook_logs (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  provider_name text not null,
  event_id text not null default '',
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  created_at timestamptz not null default now()
);

create index if not exists payments_method_created_idx on payments(payment_method, created_at desc);
create index if not exists payments_upi_provider_idx on payments(upi_provider, created_at desc);
create index if not exists payments_upi_transaction_idx on payments(upi_transaction_id);
create index if not exists upi_providers_merchant_active_idx on upi_providers(merchant_id, is_active, priority);
create index if not exists upi_webhook_logs_merchant_created_idx on upi_webhook_logs(merchant_id, created_at desc);
create unique index if not exists upi_webhook_logs_dedupe_idx on upi_webhook_logs(merchant_id, provider_name, event_id);

alter table upi_webhook_logs
  add column if not exists event_id text;

update upi_webhook_logs
set event_id = coalesce(
  nullif(event_id, ''),
  payload ->> 'eventId',
  payload ->> 'event_id',
  payload ->> 'id',
  encode(digest(provider_name || ':' || payload::text, 'sha256'), 'hex')
)
where event_id is null or event_id = '';

delete from upi_webhook_logs t
using (
  select id
  from (
    select id,
           row_number() over (
             partition by merchant_id, provider_name, event_id
             order by created_at desc, id desc
           ) as rn
    from upi_webhook_logs
  ) ranked
  where ranked.rn > 1
) d
where t.id = d.id;

alter table upi_webhook_logs
  alter column event_id set not null;
