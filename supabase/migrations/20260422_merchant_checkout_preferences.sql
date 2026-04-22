alter table merchants
  add column if not exists accepted_checkout_routes jsonb not null default '[
    {"asset":"BTC","networks":["BTC"]},
    {"asset":"ETH","networks":["ERC20"]},
    {"asset":"USDT","networks":["TRC20","ERC20","SOL"]}
  ]'::jsonb;

alter table merchants
  add column if not exists default_checkout_route jsonb not null default '{"asset":"BTC","network":"BTC"}'::jsonb;

update merchants
set accepted_checkout_routes = '[
  {"asset":"BTC","networks":["BTC"]},
  {"asset":"ETH","networks":["ERC20"]},
  {"asset":"USDT","networks":["TRC20","ERC20","SOL"]}
]'::jsonb
where accepted_checkout_routes is null;

update merchants
set default_checkout_route = jsonb_build_object(
  'asset',
  coalesce(accepted_checkout_routes -> 0 ->> 'asset', 'BTC'),
  'network',
  coalesce(accepted_checkout_routes -> 0 -> 'networks' ->> 0, 'BTC')
)
where default_checkout_route is null;
