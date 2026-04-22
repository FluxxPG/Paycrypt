alter table merchants
  add column if not exists default_checkout_route jsonb not null default '{"asset":"BTC","network":"BTC"}'::jsonb;

update merchants
set default_checkout_route = jsonb_build_object(
  'asset',
  coalesce(accepted_checkout_routes -> 0 ->> 'asset', 'BTC'),
  'network',
  coalesce(accepted_checkout_routes -> 0 -> 'networks' ->> 0, 'BTC')
)
where default_checkout_route is null
   or not (default_checkout_route ? 'asset' and default_checkout_route ? 'network');
