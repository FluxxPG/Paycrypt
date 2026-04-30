alter table if exists subscriptions
  add column if not exists binance_enabled boolean not null default true;

alter table if exists subscriptions
  add column if not exists trust_wallet_enabled boolean not null default false;

alter table if exists subscriptions
  drop constraint if exists subscriptions_plan_code_check;

with migrated as (
  update subscriptions
     set plan_code = case
       when plan_code = 'starter' then 'free'
       when plan_code = 'custom_selective' then 'premium'
       when plan_code = 'custom_enterprise' then 'custom'
       else plan_code
     end
   where plan_code in ('starter', 'custom_selective', 'custom_enterprise')
   returning id, plan_code
)
update subscriptions s
   set monthly_price_inr = case
         when s.plan_code = 'free' then 0
         when s.plan_code = 'premium' then 15000
         else s.monthly_price_inr
       end,
       transaction_limit = case
         when s.plan_code = 'free' then 5000
         when s.plan_code = 'premium' then 20000
         when s.plan_code = 'custom' then -1
         else s.transaction_limit
       end,
       setup_fee_inr = case
         when s.plan_code = 'custom' then 10000
         else 0
       end,
       setup_fee_usdt = case
         when s.plan_code = 'custom' then 10000
         else 0
       end,
       platform_fee_percent = 1,
       non_custodial_wallet_limit = case
         when s.plan_code = 'free' then 0
         when s.plan_code = 'premium' then 3
         when s.plan_code = 'custom' then -1
         else s.non_custodial_wallet_limit
       end,
       upi_enabled = case
         when s.plan_code = 'custom' then true
         else false
       end,
       upi_provider_limit = case
         when s.plan_code = 'custom' then -1
         else 0
       end,
       binance_enabled = true,
       trust_wallet_enabled = case
         when s.plan_code in ('premium', 'custom') then true
         else false
       end,
       updated_at = now()
 where s.id in (select id from migrated);

alter table if exists subscriptions
  add constraint subscriptions_plan_code_check
  check (plan_code in ('free', 'premium', 'custom'));

alter table if exists billing_invoices
  drop constraint if exists billing_invoices_plan_code_check;

update billing_invoices
   set plan_code = case
     when plan_code = 'starter' then 'free'
     when plan_code = 'custom_selective' then 'premium'
     when plan_code = 'custom_enterprise' then 'custom'
     else plan_code
   end
 where plan_code in ('starter', 'custom_selective', 'custom_enterprise');

alter table if exists billing_invoices
  add constraint billing_invoices_plan_code_check
  check (plan_code in ('free', 'premium', 'custom'));

create table if not exists plan_catalog (
  code text primary key,
  name text not null,
  description text,
  monthly_price_inr numeric(12,2) not null default 0,
  transaction_limit integer not null default 0,
  setup_fee_inr numeric(12,2) not null default 0,
  setup_fee_usdt numeric(18,2) not null default 0,
  platform_fee_percent numeric(5,2) not null default 1,
  non_custodial_wallet_limit integer not null default 0,
  upi_enabled boolean not null default false,
  upi_provider_limit integer not null default 0,
  binance_enabled boolean not null default true,
  trust_wallet_enabled boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fee_configs (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global', 'plan', 'merchant', 'payment')),
  plan_code text,
  merchant_id text references merchants(id) on delete cascade,
  chain text,
  payment_id text,
  fee_percent numeric(10,4) not null,
  min_fee_usdt numeric(18,8),
  max_fee_usdt numeric(18,8),
  is_active boolean not null default true,
  valid_from timestamptz,
  valid_until timestamptz,
  created_by text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists merchant_features (
  merchant_id text primary key references merchants(id) on delete cascade,
  custodial_enabled boolean not null default true,
  non_custodial_enabled boolean not null default false,
  upi_enabled boolean not null default false,
  upi_provider_limit integer not null default 0,
  binance_enabled boolean not null default true,
  trust_wallet_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists binance_credentials (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  source varchar(32) not null default 'merchant',
  api_key_encrypted text not null,
  api_secret_encrypted text not null,
  is_active boolean not null default true,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  features jsonb not null default '{}'::jsonb,
  trading_status jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists trust_wallet_credentials (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  wallet_address text not null,
  private_key_encrypted text,
  is_active boolean not null default true,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  supported_networks text[] not null default '{}'::text[],
  features jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists withdrawal_whitelist (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  label text not null,
  asset text not null,
  network text not null,
  address text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

update fee_configs
   set plan_code = case
     when plan_code = 'starter' then 'free'
     when plan_code = 'custom_selective' then 'premium'
     when plan_code = 'custom_enterprise' then 'custom'
     else plan_code
   end
 where plan_code in ('starter', 'custom_selective', 'custom_enterprise');

update fee_configs
   set fee_percent = 1.0000,
       note = coalesce(note, 'Normalized to 1% platform fee'),
       updated_at = now()
 where scope in ('global', 'plan')
   and is_active = true
   and (fee_percent is distinct from 1.0000);

delete from plan_catalog
 where code in ('starter', 'custom_selective', 'custom_enterprise', 'free', 'premium', 'custom');

insert into plan_catalog (
  code,
  name,
  description,
  monthly_price_inr,
  transaction_limit,
  setup_fee_inr,
  setup_fee_usdt,
  platform_fee_percent,
  non_custodial_wallet_limit,
  upi_enabled,
  upi_provider_limit,
  binance_enabled,
  trust_wallet_enabled,
  is_active
)
values
  ('free', 'Free', 'Custodial crypto gateway plan with 1% fee', 0, 5000, 0, 0, 1, 0, false, 0, true, false, true),
  ('premium', 'Premium', 'Priority merchant plan with non-custodial routing and 1% fee', 15000, 20000, 0, 0, 1, 3, false, 0, true, true, true),
  ('custom', 'Custom', 'Enterprise configurable plan with editable fee policy', 0, -1, 10000, 10000, 1, -1, true, -1, true, true, true);

insert into merchant_features (
  merchant_id,
  custodial_enabled,
  non_custodial_enabled,
  upi_enabled,
  upi_provider_limit,
  binance_enabled,
  trust_wallet_enabled
)
select
  m.id,
  coalesce(m.custodial_enabled, true),
  case when s.plan_code in ('premium', 'custom') then true else coalesce(m.non_custodial_enabled, false) end,
  case when s.plan_code = 'custom' then true else false end,
  case when s.plan_code = 'custom' then -1 else 0 end,
  true,
  case when s.plan_code in ('premium', 'custom') then true else false end
from merchants m
left join subscriptions s on s.merchant_id = m.id
on conflict (merchant_id) do update set
  custodial_enabled = excluded.custodial_enabled,
  non_custodial_enabled = excluded.non_custodial_enabled,
  upi_enabled = excluded.upi_enabled,
  upi_provider_limit = excluded.upi_provider_limit,
  binance_enabled = excluded.binance_enabled,
  trust_wallet_enabled = excluded.trust_wallet_enabled,
  updated_at = now();

do $$
begin
  if exists (
    select 1
    from pg_class
    where relname = 'ledger_balances'
      and relkind = 'r'
  ) then
    if exists (
      select 1
      from pg_constraint
      where conname = 'ledger_balances_merchant_id_key'
    ) then
      alter table ledger_balances drop constraint ledger_balances_merchant_id_key;
    end if;
    execute 'create unique index if not exists ledger_balances_merchant_asset_unique_idx on ledger_balances(merchant_id, asset)';
  end if;
end $$;
