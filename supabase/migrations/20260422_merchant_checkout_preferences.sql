alter table merchants
  add column if not exists accepted_checkout_routes jsonb not null default '[
    {"asset":"BTC","networks":["BTC"]},
    {"asset":"ETH","networks":["ERC20"]},
    {"asset":"USDT","networks":["TRC20","ERC20","SOL"]}
  ]'::jsonb;

update merchants
set accepted_checkout_routes = '[
  {"asset":"BTC","networks":["BTC"]},
  {"asset":"ETH","networks":["ERC20"]},
  {"asset":"USDT","networks":["TRC20","ERC20","SOL"]}
]'::jsonb
where accepted_checkout_routes is null;
