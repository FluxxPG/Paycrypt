-- Automation Engine Migration
-- Implements rule-based automation triggers and actions

create table if not exists automation_rules (
  id text primary key,
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

create table if not exists automation_executions (
  id uuid primary key default gen_random_uuid(),
  rule_id text not null references automation_rules(id) on delete cascade,
  trigger_event text not null,
  event_data jsonb not null default '{}'::jsonb,
  execution_status text not null check (execution_status in ('success', 'failed', 'partial')),
  execution_results jsonb not null default '{}'::jsonb,
  error_message text,
  executed_at timestamptz not null default now()
);

-- Indexes for automation tables
create index if not exists automation_rules_event_idx on automation_rules(trigger_event, is_active);
create index if not exists automation_rules_merchant_idx on automation_rules(merchant_id, is_active);
create index if not exists automation_executions_rule_idx on automation_executions(rule_id, executed_at desc);
create index if not exists automation_executions_event_idx on automation_executions(trigger_event, executed_at desc);

-- Add trigger for updated_at
create trigger automation_rules_updated_at
  before update on automation_rules
  for each row
  execute procedure update_updated_at_column();
