create index if not exists wallets_payment_lookup_idx on wallets(payment_id, network, address);
create index if not exists transactions_payment_status_idx on transactions(payment_id, status);
create index if not exists settlements_payment_status_idx on settlements(payment_id, status);

create or replace view payment_ledger as
select
  p.id,
  p.merchant_id,
  p.amount_fiat,
  p.amount_crypto as quoted_amount_crypto,
  coalesce(t.amount_crypto, p.amount_crypto) as received_amount_crypto,
  p.exchange_rate,
  p.fiat_currency,
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
