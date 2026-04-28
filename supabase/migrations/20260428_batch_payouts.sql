-- Batch Payout System Migration
-- Implements batch payout functionality for multiple withdrawals

create table if not exists batch_payouts (
  id text primary key,
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

create table if not exists batch_payout_items (
  id text primary key,
  batch_id text not null references batch_payouts(id) on delete cascade,
  merchant_id text not null references merchants(id) on delete cascade,
  asset text not null,
  network text not null,
  amount_crypto numeric(24,8) not null,
  amount_fiat numeric(18,2) not null,
  destination_address text not null,
  reference text,
  withdrawal_id uuid references treasury_withdrawals(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'cancelled')),
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Indexes for batch payout tables
create index if not exists batch_payouts_merchant_idx on batch_payouts(merchant_id, created_at desc);
create index if not exists batch_payouts_status_idx on batch_payouts(status, created_at desc);
create index if not exists batch_payout_items_batch_idx on batch_payout_items(batch_id, created_at);
create index if not exists batch_payout_items_merchant_idx on batch_payout_items(merchant_id, created_at desc);
create index if not exists batch_payout_items_status_idx on batch_payout_items(status, created_at desc);

-- Add trigger for updated_at
create trigger batch_payouts_updated_at
  before update on batch_payouts
  for each row
  execute procedure update_updated_at_column();
