-- Paycrypt Consolidated Database Schema
-- Version: 2026-04-28
-- This file contains all tables, indexes, triggers, and initial data

-- Extensions
create extension if not exists "pgcrypto";

-- Helper function for updated_at triggers
create or replace function update_updated_at_column()
returns trigger as $$
begin
  if to_jsonb(new) ? 'updated_at' then
    new := jsonb_populate_record(new, jsonb_build_object('updated_at', now()));
  end if;
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Merchants table
create table if not exists merchants (
  id text primary key,
  name text not null,
  slug text not null unique,
  email text not null unique,
  status text not null default 'active',
  custodial_provider text not null default 'binance',
  custodial_enabled boolean not null default true,
  non_custodial_enabled boolean not null default false,
  accepted_checkout_routes jsonb not null default '[
    {"asset":"BTC","networks":["BTC"]},
    {"asset":"ETH","networks":["ERC20"]},
    {"asset":"USDT","networks":["TRC20","ERC20","SOL"]}
  ]'::jsonb,
  default_checkout_route jsonb not null default '{"asset":"BTC","network":"BTC"}'::jsonb,
  webhook_base_url text,
  binance_api_key_enc text,
  binance_api_secret_enc text,
  binance_connected_at timestamptz,
  upi_default_amount_fiat numeric(18,2) not null default 999,
  crypto_default_amount_fiat numeric(18,2) not null default 2499,
  upi_manual_vpa text,
  upi_manual_qr_url text,
  upi_manual_mode_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Users table (with employer role support)
create table if not exists users (
  id text primary key,
  merchant_id text not null references merchants(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('merchant', 'admin', 'super_admin', 'employer')),
  must_change_password boolean not null default false,
  password_setup_completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Refresh tokens table
create table if not exists refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  token text not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- API keys table
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

-- Wallets table
create table if not exists wallets (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  payment_id text,
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

-- Subscriptions table (with three-plan rollout)
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  plan_code text not null check (plan_code in ('free', 'premium', 'custom')),
  status text not null default 'active',
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
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_non_custodial_wallet_limit_check check (non_custodial_wallet_limit >= -1),
  constraint subscriptions_upi_provider_limit_check check (upi_provider_limit >= -1)
);

-- Billing invoices table
create table if not exists billing_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  merchant_id text not null references merchants(id) on delete cascade,
  subscription_id uuid references subscriptions(id) on delete set null,
  plan_code text not null check (plan_code in ('free', 'premium', 'custom')),
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

-- Pricing and merchant feature configuration
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

-- Payments table (with UPI support)
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
  payment_method text not null default 'crypto' check (payment_method in ('crypto', 'upi')),
  upi_provider text,
  upi_transaction_id text,
  upi_intent_url text,
  upi_qr_code text,
  upi_status text,
  provider_response jsonb not null default '{}'::jsonb,
  transaction_id text,
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

-- Payment links table
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

-- Transactions table
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

-- Settlements table
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

-- Webhook endpoints table
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

-- Webhook logs table
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

-- ============================================================================
-- UPI TABLES
-- ============================================================================

-- Merchant UPI settings table
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

-- UPI providers table
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

-- UPI webhook logs table
create table if not exists upi_webhook_logs (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  provider_name text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  created_at timestamptz not null default now()
);

-- ============================================================================
-- PLATFORM INTEGRATIONS TABLES
-- ============================================================================

-- Platform connections table
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

-- Integration sync logs table
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

-- ============================================================================
-- SYSTEM TABLES
-- ============================================================================

-- Usage logs table
create table if not exists usage_logs (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  event_type text not null,
  quantity integer not null default 1,
  created_at timestamptz not null default now()
);

-- Audit logs table
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id text not null,
  merchant_id text references merchants(id) on delete cascade,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Worker heartbeats table
create table if not exists worker_heartbeats (
  id uuid primary key default gen_random_uuid(),
  worker_name text not null,
  status text not null default 'online',
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

-- Non-custodial wallet verifications table
create table if not exists non_custodial_wallet_verifications (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  wallet_address text not null,
  asset text not null,
  network text not null,
  provider text not null default 'merchant',
  challenge_message text not null,
  signature text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  verified_at timestamptz
);

-- System alerts table
create table if not exists system_alerts (
  id uuid primary key default gen_random_uuid(),
  severity text not null,
  source text not null,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- WebSocket health table
create table if not exists ws_health (
  id uuid primary key default gen_random_uuid(),
  node_id text not null,
  clients_connected integer not null default 0,
  latency_ms integer not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ============================================================================
-- TREASURY + LEDGER SYSTEM
-- ============================================================================

-- Treasury balances table
create table if not exists treasury_balances (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('platform', 'merchant')),
  owner_id text not null,
  asset text not null,
  network text not null,
  wallet_address text,
  balance_type text not null check (balance_type in ('inbound', 'aggregation', 'cold_vault', 'withdrawable', 'pending')),
  amount_crypto numeric(24,8) not null default 0,
  amount_fiat_equivalent numeric(18,2) not null default 0,
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (owner_type, owner_id, asset, network, balance_type)
);

-- Treasury transactions table
create table if not exists treasury_transactions (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('platform', 'merchant')),
  owner_id text not null,
  asset text not null,
  network text not null,
  transaction_type text not null check (transaction_type in (
    'payment_received', 'fee_deducted', 'settlement_credited', 'withdrawal_requested',
    'withdrawal_processed', 'withdrawal_failed', 'sweep_to_aggregation', 'sweep_to_cold',
    'gas_fee_deducted', 'adjustment_credit', 'adjustment_debit', 'batch_payout'
  )),
  amount_crypto numeric(24,8) not null,
  amount_fiat_equivalent numeric(18,2) not null,
  from_balance_type text,
  to_balance_type text,
  related_payment_id text,
  related_withdrawal_id uuid,
  related_settlement_id uuid,
  tx_hash text,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

-- Treasury fees table
create table if not exists treasury_fees (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('platform', 'merchant')),
  owner_id text not null,
  payment_id text not null,
  asset text not null,
  network text not null,
  fee_percent numeric(5,2) not null,
  amount_crypto numeric(24,8) not null,
  amount_fiat numeric(18,2) not null,
  exchange_rate numeric(24,8) not null,
  fee_type text not null check (fee_type in ('platform', 'gas', 'withdrawal_penalty')),
  description text,
  created_at timestamptz not null default now()
);

-- Treasury withdrawals table
create table if not exists treasury_withdrawals (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('platform', 'merchant')),
  owner_id text not null,
  asset text not null,
  network text not null,
  amount_crypto numeric(24,8) not null,
  amount_fiat_equivalent numeric(18,2) not null,
  destination_address text not null,
  destination_wallet_provider text,
  gas_fee_crypto numeric(24,8) not null default 0,
  gas_fee_fiat numeric(18,2) not null default 0,
  penalty_fee_crypto numeric(24,8) not null default 0,
  penalty_fee_fiat numeric(18,2) not null default 0,
  final_amount_crypto numeric(24,8) not null,
  tx_hash text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  rejection_reason text,
  approved_by text,
  approved_at timestamptz,
  processed_by text,
  processed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Treasury adjustments table
create table if not exists treasury_adjustments (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null check (owner_type in ('platform', 'merchant')),
  owner_id text not null,
  asset text not null,
  network text not null,
  adjustment_type text not null check (adjustment_type in ('credit', 'debit')),
  amount_crypto numeric(24,8) not null,
  amount_fiat_equivalent numeric(18,2) not null,
  reason text not null,
  performed_by text not null,
  approved_by text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Platform treasury wallet configuration
create table if not exists platform_treasury_wallets (
  id uuid primary key default gen_random_uuid(),
  wallet_type text not null check (wallet_type in ('inbound', 'aggregation', 'cold_vault')),
  asset text not null,
  network text not null,
  wallet_address text not null,
  private_key_encrypted text,
  provider text not null default 'binance',
  is_active boolean not null default true,
  is_default boolean not null default false,
  min_balance_threshold numeric(24,8) not null default 0,
  auto_sweep_enabled boolean not null default false,
  auto_sweep_threshold numeric(24,8) not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wallet_type, asset, network)
);

-- Withdrawal fee configuration
create table if not exists withdrawal_fee_config (
  id uuid primary key default gen_random_uuid(),
  asset text not null,
  network text not null,
  min_withdrawal_amount_fiat numeric(18,2) not null default 100,
  min_withdrawal_penalty_fiat numeric(18,2) not null default 1.5,
  min_withdrawal_penalty_crypto numeric(24,8) not null default 0,
  gas_fee_fixed_crypto numeric(24,8) not null default 0,
  gas_fee_fixed_fiat numeric(18,2) not null default 0,
  gas_fee_percent numeric(5,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (asset, network)
);

-- ============================================================================
-- BATCH PAYOUTS SYSTEM
-- ============================================================================

-- Batch payouts table
create table if not exists batch_payouts (
  id uuid primary key default gen_random_uuid(),
  merchant_id text not null references merchants(id) on delete cascade,
  asset text not null,
  network text not null,
  total_amount_crypto numeric(24,8) not null,
  total_amount_fiat numeric(18,2) not null,
  payout_count integer not null,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'partial', 'failed', 'cancelled')),
  description text,
  performed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Batch payout items table
create table if not exists batch_payout_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references batch_payouts(id) on delete cascade,
  merchant_id text not null references merchants(id) on delete cascade,
  asset text not null,
  network text not null,
  amount_crypto numeric(24,8) not null,
  amount_fiat numeric(18,2) not null,
  destination_address text not null,
  reference text,
  withdrawal_id uuid references treasury_withdrawals(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- AUTOMATION ENGINE
-- ============================================================================

-- Automation rules table
create table if not exists automation_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  trigger_event text not null check (trigger_event in (
    'payment.confirmed', 'payment.failed', 'payment.expired',
    'withdrawal.requested', 'withdrawal.completed', 'withdrawal.failed',
    'balance.low', 'balance.high', 'settlement.completed'
  )),
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  merchant_id text references merchants(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Automation executions table
create table if not exists automation_executions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references automation_rules(id) on delete cascade,
  trigger_event text not null,
  event_data jsonb not null default '{}'::jsonb,
  execution_status text not null check (execution_status in ('success', 'failed', 'partial')),
  execution_results jsonb not null default '{}'::jsonb,
  error_message text,
  executed_at timestamptz not null default now()
);

-- ============================================================================
-- SSO SYSTEM
-- ============================================================================

-- SSO applications table
create table if not exists sso_applications (
  id uuid primary key default gen_random_uuid(),
  app_name text not null,
  app_type text not null check (app_type in ('shopify', 'woocommerce', 'wordpress', 'opencart', 'custom')),
  client_id text not null unique,
  client_secret_hash text not null,
  redirect_uris text[] not null default '{}',
  scopes text[] not null default '{}',
  is_active boolean not null default true,
  merchant_id text references merchants(id) on delete cascade,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- SSO authorization codes table
create table if not exists sso_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  client_id text not null,
  merchant_id text not null references merchants(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  redirect_uri text not null,
  scopes text[] not null default '{}',
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- SSO access tokens table
create table if not exists sso_access_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  client_id text not null,
  merchant_id text not null references merchants(id) on delete cascade,
  user_id text references users(id) on delete cascade,
  scopes text[] not null default '{}',
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- SSO refresh tokens table
create table if not exists sso_refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  access_token_id uuid references sso_access_tokens(id) on delete cascade,
  client_id text not null,
  merchant_id text not null references merchants(id) on delete cascade,
  user_id text references users(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- SSO sessions table
create table if not exists sso_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  merchant_id text not null references merchants(id) on delete cascade,
  user_id text references users(id) on delete cascade,
  client_id text,
  ip_address text,
  user_agent text,
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- EMPLOYER OF RECORD (EOR) + PAYROLL SYSTEM
-- ============================================================================

-- Drop existing EOR tables in reverse dependency order
drop table if exists chat_command_logs cascade;
drop table if exists chat_integrations cascade;
drop table if exists payroll_approvals cascade;
drop table if exists payslips cascade;
drop table if exists onboarding_documents cascade;
drop table if exists payroll_runs cascade;
drop table if exists employment_contracts cascade;
drop table if exists employees cascade;
drop table if exists employers cascade;
drop table if exists fx_rates cascade;

-- Employers table
create table if not exists employers (
  id text primary key,
  merchant_id text references merchants(id) on delete cascade,
  company_name text not null,
  company_legal_name text not null,
  registration_number text,
  tax_id text,
  country text not null,
  state_province text,
  city text not null,
  address text not null,
  postal_code text not null,
  contact_email text not null,
  contact_phone text,
  status text not null default 'active' check (status in ('active', 'suspended', 'pending_onboarding')),
  onboarding_completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (merchant_id)
);

-- Employees table
create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  employer_id text not null references employers(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  date_of_birth date,
  nationality text not null,
  country_of_residence text not null,
  tax_id text,
  bank_account_number text,
  bank_routing_number text,
  bank_name text,
  bank_address text,
  crypto_address text,
  crypto_network text,
  employment_type text not null check (employment_type in ('full_time', 'part_time', 'contractor')),
  status text not null default 'pending_onboarding' check (status in ('pending_onboarding', 'active', 'inactive', 'terminated')),
  onboarding_completed_at timestamptz,
  termination_date date,
  termination_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employer_id, email)
);

-- Employment contracts table
create table if not exists employment_contracts (
  id uuid primary key default gen_random_uuid(),
  employer_id text not null references employers(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  contract_type text not null check (contract_type in ('full_time', 'part_time', 'contractor')),
  start_date date not null,
  end_date date,
  salary_amount numeric(18,2) not null,
  salary_currency text not null default 'USD',
  salary_frequency text not null check (salary_frequency in ('monthly', 'bi_weekly', 'weekly', 'hourly')),
  hourly_rate numeric(12,2),
  hours_per_week numeric(5,2),
  benefits jsonb not null default '{}'::jsonb,
  probation_period_months integer,
  notice_period_days integer,
  status text not null default 'active' check (status in ('draft', 'active', 'expired', 'terminated')),
  signed_at timestamptz,
  signed_by text,
  document_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id)
);

-- Payroll runs table
create table if not exists payroll_runs (
  id uuid primary key default gen_random_uuid(),
  employer_id text not null references employers(id) on delete cascade,
  run_number integer not null,
  period_start date not null,
  period_end date not null,
  scheduled_pay_date date not null,
  total_employees integer not null default 0,
  total_gross_pay numeric(18,2) not null default 0,
  total_net_pay numeric(18,2) not null default 0,
  total_taxes numeric(18,2) not null default 0,
  total_deductions numeric(18,2) not null default 0,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'processing', 'completed', 'cancelled', 'failed')),
  approved_by text,
  approved_at timestamptz,
  processed_by text,
  processed_at timestamptz,
  batch_payout_id uuid references batch_payouts(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employer_id, run_number)
);

-- Payslips table
create table if not exists payslips (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  payslip_number text not null,
  gross_pay numeric(18,2) not null,
  net_pay numeric(18,2) not null,
  currency text not null default 'USD',
  pay_date date not null,
  earnings jsonb not null default '[]'::jsonb,
  deductions jsonb not null default '[]'::jsonb,
  taxes jsonb not null default '[]'::jsonb,
  benefits jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  withdrawal_id uuid references treasury_withdrawals(id) on delete set null,
  document_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payroll_run_id, employee_id)
);

-- Onboarding documents table
create table if not exists onboarding_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  document_type text not null check (document_type in ('passport', 'id_card', 'tax_form', 'bank_statement', 'employment_contract', 'nda', 'other')),
  document_name text not null,
  document_url text not null,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected', 'expired')),
  reviewed_by text,
  reviewed_at timestamptz,
  rejection_reason text,
  expiry_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- FX rates table
create table if not exists fx_rates (
  id uuid primary key default gen_random_uuid(),
  from_currency text not null,
  to_currency text not null,
  rate numeric(24,8) not null,
  source text not null default 'manual',
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (from_currency, to_currency, valid_from)
);

-- Payroll approvals table
create table if not exists payroll_approvals (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references payroll_runs(id) on delete cascade,
  approver_id text not null,
  approval_level integer not null default 1,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  comments text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (payroll_run_id, approver_id, approval_level)
);

-- Chat integrations table
create table if not exists chat_integrations (
  id uuid primary key default gen_random_uuid(),
  employer_id text not null references employers(id) on delete cascade,
  platform text not null check (platform in ('slack', 'whatsapp', 'telegram')),
  workspace_id text,
  channel_id text,
  bot_token_enc text,
  webhook_url text,
  enabled_commands text[] not null default '{}'::text[],
  status text not null default 'active' check (status in ('active', 'disabled', 'error')),
  last_sync_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employer_id, platform)
);

-- Chat command logs table
create table if not exists chat_command_logs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references chat_integrations(id) on delete cascade,
  command text not null,
  user_id text not null,
  channel_id text,
  payload jsonb not null default '{}'::jsonb,
  response jsonb not null default '{}'::jsonb,
  status text not null default 'success' check (status in ('success', 'error', 'pending')),
  error_message text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'wallets_payment_id_fkey'
  ) then
    alter table wallets
      add constraint wallets_payment_id_fkey
      foreign key (payment_id) references payments(id) on delete set null;
  end if;
end $$;

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Core tables indexes
create index if not exists api_keys_lookup_idx on api_keys(key_prefix, key_type);
create unique index if not exists api_keys_unique_idx on api_keys(merchant_id, key_type, key_prefix);
create unique index if not exists wallets_unique_idx on wallets(merchant_id, wallet_type, provider, asset, network, address);
create index if not exists wallets_merchant_created_idx on wallets(merchant_id, created_at desc);
create index if not exists wallets_payment_lookup_idx on wallets(payment_id, network, address);
create unique index if not exists subscriptions_merchant_unique_idx on subscriptions(merchant_id);
create index if not exists billing_invoices_merchant_created_idx on billing_invoices(merchant_id, created_at desc);
create index if not exists billing_invoices_status_idx on billing_invoices(status);
create index if not exists plan_catalog_active_idx on plan_catalog(is_active, code);
create index if not exists fee_configs_scope_idx on fee_configs(scope, is_active, chain);
create index if not exists fee_configs_plan_idx on fee_configs(plan_code, is_active);
create index if not exists fee_configs_merchant_idx on fee_configs(merchant_id, is_active);
create index if not exists fee_configs_payment_idx on fee_configs(payment_id, is_active);
create index if not exists merchant_features_flags_idx on merchant_features(upi_enabled, non_custodial_enabled);
create unique index if not exists binance_credentials_merchant_source_idx on binance_credentials(merchant_id, source);
create index if not exists trust_wallet_credentials_merchant_idx on trust_wallet_credentials(merchant_id, is_active);
create index if not exists withdrawal_whitelist_merchant_idx on withdrawal_whitelist(merchant_id, asset, network, is_active);
create index if not exists payments_merchant_created_idx on payments(merchant_id, created_at desc);
create index if not exists payments_status_idx on payments(status);
create index if not exists payments_method_created_idx on payments(payment_method, created_at desc);
create index if not exists payments_upi_provider_idx on payments(upi_provider, created_at desc);
create index if not exists payments_upi_transaction_idx on payments(upi_transaction_id);
create index if not exists transactions_merchant_created_idx on transactions(merchant_id, created_at desc);
create unique index if not exists transactions_payment_unique_idx on transactions(payment_id);
create index if not exists transactions_payment_status_idx on transactions(payment_id, status);
create unique index if not exists settlements_payment_unique_idx on settlements(payment_id);
create index if not exists settlements_merchant_created_idx on settlements(merchant_id, created_at desc);
create index if not exists settlements_payment_status_idx on settlements(payment_id, status);
create index if not exists usage_logs_merchant_created_idx on usage_logs(merchant_id, created_at desc);
create unique index if not exists worker_heartbeats_name_idx on worker_heartbeats(worker_name);
create index if not exists non_custodial_wallet_verifications_idx on non_custodial_wallet_verifications(merchant_id, wallet_address);
create index if not exists system_alerts_created_idx on system_alerts(created_at desc);
create unique index if not exists ws_health_node_idx on ws_health(node_id);
create index if not exists users_role_idx on users(role);

-- UPI indexes
create index if not exists upi_providers_merchant_active_idx on upi_providers(merchant_id, is_active, priority);
create index if not exists upi_webhook_logs_merchant_created_idx on upi_webhook_logs(merchant_id, created_at desc);
create unique index if not exists upi_webhook_logs_dedupe_idx on upi_webhook_logs(merchant_id, provider_name, event_id);

-- Platform integrations indexes
create index if not exists platform_connections_merchant_idx on platform_connections(merchant_id, updated_at desc);
create index if not exists platform_connections_platform_status_idx on platform_connections(platform, status, updated_at desc);
create index if not exists integration_sync_logs_connection_idx on integration_sync_logs(connection_id, created_at desc);

-- Treasury indexes
create index if not exists treasury_balances_owner_idx on treasury_balances(owner_type, owner_id);
create index if not exists treasury_balances_asset_network_idx on treasury_balances(asset, network);
create index if not exists treasury_balances_type_idx on treasury_balances(balance_type);
create index if not exists treasury_transactions_owner_idx on treasury_transactions(owner_type, owner_id, created_at desc);
create index if not exists treasury_transactions_payment_idx on treasury_transactions(related_payment_id);
create index if not exists treasury_transactions_withdrawal_idx on treasury_transactions(related_withdrawal_id);
create index if not exists treasury_transactions_type_idx on treasury_transactions(transaction_type, created_at desc);
create index if not exists treasury_fees_payment_idx on treasury_fees(payment_id);
create index if not exists treasury_fees_owner_idx on treasury_fees(owner_type, owner_id, created_at desc);
create index if not exists treasury_withdrawals_owner_idx on treasury_withdrawals(owner_type, owner_id, created_at desc);
create index if not exists treasury_withdrawals_status_idx on treasury_withdrawals(status, created_at desc);
create index if not exists treasury_adjustments_owner_idx on treasury_adjustments(owner_type, owner_id, created_at desc);
create index if not exists treasury_adjustments_status_idx on treasury_adjustments(status, created_at desc);
create index if not exists platform_treasury_wallets_type_idx on platform_treasury_wallets(wallet_type, asset, network);

-- Batch payouts indexes
create index if not exists batch_payouts_merchant_idx on batch_payouts(merchant_id, created_at desc);
create index if not exists batch_payouts_status_idx on batch_payouts(status, created_at desc);
create index if not exists batch_payout_items_batch_idx on batch_payout_items(batch_id, created_at);
create index if not exists batch_payout_items_merchant_idx on batch_payout_items(merchant_id, created_at desc);
create index if not exists batch_payout_items_status_idx on batch_payout_items(status, created_at desc);

-- Automation indexes
create index if not exists automation_rules_event_idx on automation_rules(trigger_event, is_active);
create index if not exists automation_rules_merchant_idx on automation_rules(merchant_id, is_active);
create index if not exists automation_executions_rule_idx on automation_executions(rule_id, executed_at desc);
create index if not exists automation_executions_event_idx on automation_executions(trigger_event, executed_at desc);

-- SSO indexes
create index if not exists sso_applications_client_id_idx on sso_applications(client_id);
create index if not exists sso_applications_merchant_idx on sso_applications(merchant_id);
create index if not exists sso_authorization_codes_code_idx on sso_authorization_codes(code);
create index if not exists sso_authorization_codes_client_idx on sso_authorization_codes(client_id, merchant_id);
create index if not exists sso_access_tokens_token_idx on sso_access_tokens(token_hash);
create index if not exists sso_access_tokens_client_idx on sso_access_tokens(client_id, merchant_id);
create index if not exists sso_refresh_tokens_token_idx on sso_refresh_tokens(token_hash);
create index if not exists sso_refresh_tokens_access_idx on sso_refresh_tokens(access_token_id);
create index if not exists sso_sessions_session_id_idx on sso_sessions(session_id);
create index if not exists sso_sessions_merchant_idx on sso_sessions(merchant_id, user_id);
create index if not exists sso_sessions_expires_idx on sso_sessions(expires_at);

-- EOR indexes
create index if not exists employers_merchant_idx on employers(merchant_id);
create index if not exists employers_status_idx on employers(status);
create index if not exists employees_employer_idx on employees(employer_id);
create index if not exists employees_status_idx on employees(status);
create index if not exists employees_email_idx on employees(email);
create index if not exists employment_contracts_employer_idx on employment_contracts(employer_id);
create index if not exists employment_contracts_employee_idx on employment_contracts(employee_id);
create index if not exists employment_contracts_status_idx on employment_contracts(status);
create index if not exists payroll_runs_employer_idx on payroll_runs(employer_id);
create index if not exists payroll_runs_status_idx on payroll_runs(status);
create index if not exists payroll_runs_period_idx on payroll_runs(period_start, period_end);
create index if not exists payslips_payroll_idx on payslips(payroll_run_id);
create index if not exists payslips_employee_idx on payslips(employee_id);
create index if not exists payslips_status_idx on payslips(status);
create index if not exists onboarding_documents_employee_idx on onboarding_documents(employee_id);
create index if not exists onboarding_documents_status_idx on onboarding_documents(status);
create index if not exists fx_rates_currency_idx on fx_rates(from_currency, to_currency);
create index if not exists fx_rates_validity_idx on fx_rates(valid_from, valid_until);
create index if not exists payroll_approvals_run_idx on payroll_approvals(payroll_run_id);
create index if not exists chat_integrations_employer_idx on chat_integrations(employer_id);
create index if not exists chat_integrations_platform_idx on chat_integrations(platform);
create index if not exists chat_command_logs_integration_idx on chat_command_logs(integration_id);
create index if not exists chat_command_logs_created_idx on chat_command_logs(created_at desc);

-- ============================================================================
-- TRIGGERS FOR updated_at
-- ============================================================================

create trigger merchants_updated_at
  before update on merchants
  for each row
  execute procedure update_updated_at_column();

create trigger subscriptions_updated_at
  before update on subscriptions
  for each row
  execute procedure update_updated_at_column();

create trigger billing_invoices_updated_at
  before update on billing_invoices
  for each row
  execute procedure update_updated_at_column();

create trigger plan_catalog_updated_at
  before update on plan_catalog
  for each row
  execute procedure update_updated_at_column();

create trigger fee_configs_updated_at
  before update on fee_configs
  for each row
  execute procedure update_updated_at_column();

create trigger merchant_features_updated_at
  before update on merchant_features
  for each row
  execute procedure update_updated_at_column();

create trigger binance_credentials_updated_at
  before update on binance_credentials
  for each row
  execute procedure update_updated_at_column();

create trigger trust_wallet_credentials_updated_at
  before update on trust_wallet_credentials
  for each row
  execute procedure update_updated_at_column();

create trigger payments_updated_at
  before update on payments
  for each row
  execute procedure update_updated_at_column();

create trigger settlements_updated_at
  before update on settlements
  for each row
  execute procedure update_updated_at_column();

create trigger merchant_upi_settings_updated_at
  before update on merchant_upi_settings
  for each row
  execute procedure update_updated_at_column();

create trigger upi_providers_updated_at
  before update on upi_providers
  for each row
  execute procedure update_updated_at_column();

create trigger platform_connections_updated_at
  before update on platform_connections
  for each row
  execute procedure update_updated_at_column();

create trigger treasury_balances_updated_at
  before update on treasury_balances
  for each row
  execute procedure update_updated_at_column();

create trigger treasury_withdrawals_updated_at
  before update on treasury_withdrawals
  for each row
  execute procedure update_updated_at_column();

create trigger treasury_adjustments_updated_at
  before update on treasury_adjustments
  for each row
  execute procedure update_updated_at_column();

create trigger platform_treasury_wallets_updated_at
  before update on platform_treasury_wallets
  for each row
  execute procedure update_updated_at_column();

create trigger withdrawal_fee_config_updated_at
  before update on withdrawal_fee_config
  for each row
  execute procedure update_updated_at_column();

create trigger batch_payouts_updated_at
  before update on batch_payouts
  for each row
  execute procedure update_updated_at_column();

create trigger automation_rules_updated_at
  before update on automation_rules
  for each row
  execute procedure update_updated_at_column();

create trigger sso_applications_updated_at
  before update on sso_applications
  for each row
  execute procedure update_updated_at_column();

create trigger employers_updated_at
  before update on employers
  for each row
  execute procedure update_updated_at_column();

create trigger employees_updated_at
  before update on employees
  for each row
  execute procedure update_updated_at_column();

create trigger employment_contracts_updated_at
  before update on employment_contracts
  for each row
  execute procedure update_updated_at_column();

create trigger payroll_runs_updated_at
  before update on payroll_runs
  for each row
  execute procedure update_updated_at_column();

create trigger payslips_updated_at
  before update on payslips
  for each row
  execute procedure update_updated_at_column();

create trigger onboarding_documents_updated_at
  before update on onboarding_documents
  for each row
  execute procedure update_updated_at_column();

create trigger chat_integrations_updated_at
  before update on chat_integrations
  for each row
  execute procedure update_updated_at_column();

-- ============================================================================
-- VIEWS
-- ============================================================================

drop view if exists payment_ledger;

create view payment_ledger as
select
  p.id,
  p.merchant_id,
  p.amount_fiat,
  p.amount_crypto as quoted_amount_crypto,
  coalesce(t.amount_crypto, p.amount_crypto) as received_amount_crypto,
  p.exchange_rate,
  p.fiat_currency,
  p.payment_method,
  p.upi_provider,
  p.upi_transaction_id,
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

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Default merchants
insert into merchants (
  id,
  name,
  slug,
  email,
  status,
  custodial_enabled,
  non_custodial_enabled
)
values
  ('mrc_demo', 'Nebula Commerce', 'nebula-commerce', 'owner@nebula.dev', 'active', true, false),
  ('mrc_admin', 'Platform Admin', 'platform-admin', 'admin@cryptopay.dev', 'active', true, false)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  email = excluded.email,
  status = excluded.status,
  custodial_enabled = excluded.custodial_enabled,
  non_custodial_enabled = excluded.non_custodial_enabled,
  updated_at = now();

-- Default subscriptions
insert into subscriptions (
  merchant_id,
  plan_code,
  status,
  monthly_price_inr,
  transaction_limit,
  setup_fee_inr,
  setup_fee_usdt,
  platform_fee_percent,
  non_custodial_wallet_limit,
  upi_enabled,
  upi_provider_limit,
  binance_enabled,
  trust_wallet_enabled
)
values
  ('mrc_demo', 'free', 'active', 0, 5000, 0, 0, 1, 0, false, 0, true, false),
  ('mrc_admin', 'custom', 'active', 0, -1, 10000, 10000, 1, -1, true, -1, true, true)
on conflict (merchant_id) do update set
  plan_code = excluded.plan_code,
  status = excluded.status,
  monthly_price_inr = excluded.monthly_price_inr,
  transaction_limit = excluded.transaction_limit,
  setup_fee_inr = excluded.setup_fee_inr,
  setup_fee_usdt = excluded.setup_fee_usdt,
  platform_fee_percent = excluded.platform_fee_percent,
  non_custodial_wallet_limit = excluded.non_custodial_wallet_limit,
  upi_enabled = excluded.upi_enabled,
  upi_provider_limit = excluded.upi_provider_limit,
  binance_enabled = excluded.binance_enabled,
  trust_wallet_enabled = excluded.trust_wallet_enabled,
  updated_at = now();

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
  ('custom', 'Custom', 'Enterprise configurable plan with editable fee policy', 0, -1, 10000, 10000, 1, -1, true, -1, true, true, true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  monthly_price_inr = excluded.monthly_price_inr,
  transaction_limit = excluded.transaction_limit,
  setup_fee_inr = excluded.setup_fee_inr,
  setup_fee_usdt = excluded.setup_fee_usdt,
  platform_fee_percent = excluded.platform_fee_percent,
  non_custodial_wallet_limit = excluded.non_custodial_wallet_limit,
  upi_enabled = excluded.upi_enabled,
  upi_provider_limit = excluded.upi_provider_limit,
  binance_enabled = excluded.binance_enabled,
  trust_wallet_enabled = excluded.trust_wallet_enabled,
  is_active = excluded.is_active,
  updated_at = now();

insert into merchant_features (
  merchant_id,
  custodial_enabled,
  non_custodial_enabled,
  upi_enabled,
  upi_provider_limit,
  binance_enabled,
  trust_wallet_enabled
)
values
  ('mrc_demo', true, false, false, 0, true, false),
  ('mrc_admin', true, true, true, -1, true, true)
on conflict (merchant_id) do update set
  custodial_enabled = excluded.custodial_enabled,
  non_custodial_enabled = excluded.non_custodial_enabled,
  upi_enabled = excluded.upi_enabled,
  upi_provider_limit = excluded.upi_provider_limit,
  binance_enabled = excluded.binance_enabled,
  trust_wallet_enabled = excluded.trust_wallet_enabled,
  updated_at = now();

insert into fee_configs (
  scope,
  fee_percent,
  is_active,
  note
)
values
  ('global', 1.0000, true, 'Default 1% global platform fee')
on conflict do nothing;

-- Default users
insert into users (
  id,
  merchant_id,
  full_name,
  email,
  password_hash,
  role,
  must_change_password,
  password_setup_completed_at
)
values
  (
    'usr_demo_owner',
    'mrc_demo',
    'Nebula Commerce Owner',
    'owner@nebula.dev',
    '$2a$12$wJmbsqbGLKS6M1f7Igucsu5YV8COCgPoOID1iCaCHK4dC4d7fji7W',
    'merchant',
    false,
    now()
  ),
  (
    'usr_platform_admin',
    'mrc_admin',
    'Platform Admin',
    'admin@cryptopay.dev',
    '$2a$12$a1bX6X5G7uCA9Y5XRZ4RVOGg3M9OrjDEkE15aXPdIHyuaWoUC7sza',
    'super_admin',
    false,
    now()
  )
on conflict (email) do update set
  merchant_id = excluded.merchant_id,
  full_name = excluded.full_name,
  password_hash = excluded.password_hash,
  role = excluded.role,
  must_change_password = excluded.must_change_password,
  password_setup_completed_at = excluded.password_setup_completed_at;

-- Default withdrawal fee configurations
insert into withdrawal_fee_config (asset, network, min_withdrawal_amount_fiat, min_withdrawal_penalty_fiat, gas_fee_fixed_fiat)
values
  ('USDT', 'TRC20', 100, 1.5, 0.5),
  ('USDT', 'ERC20', 100, 1.5, 2.0),
  ('USDT', 'SOL', 100, 1.5, 0.1),
  ('BTC', 'BTC', 100, 1.5, 5.0),
  ('ETH', 'ERC20', 100, 1.5, 3.0)
on conflict (asset, network) do nothing;

-- Initialize platform treasury balances
insert into treasury_balances (owner_type, owner_id, asset, network, balance_type, amount_crypto, amount_fiat_equivalent)
values
  ('platform', 'platform', 'USDT', 'TRC20', 'inbound', 0, 0),
  ('platform', 'platform', 'USDT', 'TRC20', 'aggregation', 0, 0),
  ('platform', 'platform', 'USDT', 'TRC20', 'cold_vault', 0, 0),
  ('platform', 'platform', 'USDT', 'ERC20', 'inbound', 0, 0),
  ('platform', 'platform', 'USDT', 'ERC20', 'aggregation', 0, 0),
  ('platform', 'platform', 'USDT', 'ERC20', 'cold_vault', 0, 0)
on conflict (owner_type, owner_id, asset, network, balance_type) do nothing;

-- Default SSO application
insert into sso_applications (
  app_name, app_type, client_id, client_secret_hash, redirect_uris, scopes, is_active, metadata
) values (
  'Paycrypt Dashboard',
  'custom',
  'paycrypt_dashboard',
  crypt('paycrypt_dashboard_secret', gen_salt('bf')),
  array['http://localhost:3000/auth/callback', 'https://paycrypt-web-live.vercel.app/auth/callback'],
  array['read:payments', 'write:payments', 'read:wallets', 'write:wallets', 'read:treasury', 'write:treasury'],
  true,
  '{"internal": true, "description": "Internal dashboard application"}'::jsonb
) on conflict (client_id) do nothing;

-- Default FX rates (USD base)
insert into fx_rates (from_currency, to_currency, rate, source)
values
  ('USD', 'EUR', 0.92, 'manual'),
  ('USD', 'GBP', 0.79, 'manual'),
  ('USD', 'INR', 83.12, 'manual'),
  ('USD', 'JPY', 149.50, 'manual'),
  ('USD', 'CAD', 1.36, 'manual'),
  ('USD', 'AUD', 1.53, 'manual'),
  ('EUR', 'USD', 1.09, 'manual'),
  ('GBP', 'USD', 1.27, 'manual'),
  ('INR', 'USD', 0.012, 'manual')
on conflict (from_currency, to_currency, valid_from) do nothing;
