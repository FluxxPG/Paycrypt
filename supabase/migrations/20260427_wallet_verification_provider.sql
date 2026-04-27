alter table if exists non_custodial_wallet_verifications
  add column if not exists provider text;

update non_custodial_wallet_verifications
set provider = 'merchant'
where provider is null;

alter table if exists non_custodial_wallet_verifications
  alter column provider set default 'merchant';

alter table if exists non_custodial_wallet_verifications
  alter column provider set not null;

create index if not exists non_custodial_wallet_verifications_lookup_idx
  on non_custodial_wallet_verifications(merchant_id, asset, network, wallet_address, status, created_at desc);
