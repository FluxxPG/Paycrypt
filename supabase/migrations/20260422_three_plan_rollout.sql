alter table subscriptions
  drop constraint if exists subscriptions_plan_code_check;

alter table billing_invoices
  drop constraint if exists billing_invoices_plan_code_check;

alter table subscriptions
  add column if not exists setup_fee_usdt numeric(18,2) not null default 0,
  add column if not exists platform_fee_percent numeric(5,2) not null default 1,
  add column if not exists non_custodial_wallet_limit integer;

update subscriptions
set
  plan_code = case
    when plan_code in ('business', 'premium') then 'custom_selective'
    when plan_code = 'custom' then 'custom_enterprise'
    else 'starter'
  end,
  platform_fee_percent = case
    when plan_code in ('business', 'premium', 'custom') then 2
    else 1
  end,
  setup_fee_usdt = case
    when plan_code = 'custom' then 10000
    else 0
  end,
  non_custodial_wallet_limit = case
    when plan_code = 'custom' then -1
    when plan_code in ('business', 'premium') then 1
    else 0
  end;

update subscriptions
set
  platform_fee_percent = 1,
  non_custodial_wallet_limit = 0
where plan_code = 'starter';

update subscriptions
set
  platform_fee_percent = 2,
  non_custodial_wallet_limit = 1
where plan_code = 'custom_selective';

update subscriptions
set
  platform_fee_percent = coalesce(nullif(platform_fee_percent, 0), 2),
  non_custodial_wallet_limit = -1,
  setup_fee_inr = coalesce(nullif(setup_fee_inr, 0), 10000),
  setup_fee_usdt = coalesce(nullif(setup_fee_usdt, 0), 10000)
where plan_code = 'custom_enterprise';

update billing_invoices
set plan_code = case
  when plan_code in ('business', 'premium') then 'custom_selective'
  when plan_code = 'custom' then 'custom_enterprise'
  else 'starter'
end;

alter table subscriptions
  add constraint subscriptions_plan_code_check
  check (plan_code in ('starter', 'custom_selective', 'custom_enterprise'));

alter table billing_invoices
  add constraint billing_invoices_plan_code_check
  check (plan_code in ('starter', 'custom_selective', 'custom_enterprise'));
