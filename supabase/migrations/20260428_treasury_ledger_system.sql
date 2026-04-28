-- Treasury + Ledger System Migration
-- Implements multi-layer treasury with fee deduction and withdrawal management

-- Treasury balances table - tracks balances for platform and merchants
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

-- Treasury transactions table - tracks all treasury movements
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

-- Treasury fees table - tracks all fee deductions
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

-- Treasury withdrawals table - manages withdrawal requests
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

-- Treasury adjustments table - for manual balance adjustments
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

-- Indexes for treasury tables
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

-- Insert default withdrawal fee configurations
insert into withdrawal_fee_config (asset, network, min_withdrawal_amount_fiat, min_withdrawal_penalty_fiat, gas_fee_fixed_fiat)
values
  ('USDT', 'TRC20', 100, 1.5, 0.5),
  ('USDT', 'ERC20', 100, 1.5, 2.0),
  ('USDT', 'SOL', 100, 1.5, 0.1),
  ('BTC', 'BTC', 100, 1.5, 5.0),
  ('ETH', 'ERC20', 100, 1.5, 3.0)
on conflict (asset, network) do nothing;

-- Insert default platform treasury wallet placeholders (to be configured with actual addresses)
insert into platform_treasury_wallets (wallet_type, asset, network, wallet_address, provider, is_default)
values
  ('inbound', 'USDT', 'TRC20', 'PLATFORM_INBOUND_TRC20', 'binance', true),
  ('aggregation', 'USDT', 'TRC20', 'PLATFORM_AGG_TRC20', 'binance', true),
  ('cold_vault', 'USDT', 'TRC20', 'PLATFORM_COLD_TRC20', 'binance', true),
  ('inbound', 'USDT', 'ERC20', 'PLATFORM_INBOUND_ERC20', 'binance', true),
  ('aggregation', 'USDT', 'ERC20', 'PLATFORM_AGG_ERC20', 'binance', true),
  ('cold_vault', 'USDT', 'ERC20', 'PLATFORM_COLD_ERC20', 'binance', true)
on conflict (wallet_type, asset, network) do nothing;

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

-- Add trigger for updated_at on treasury tables
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
