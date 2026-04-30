alter table if exists batch_payout_items
  drop constraint if exists batch_payout_items_status_check;

alter table if exists batch_payout_items
  add constraint batch_payout_items_status_check
  check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled'));

create index if not exists batch_payout_items_withdrawal_idx
  on batch_payout_items(withdrawal_id)
  where withdrawal_id is not null;

create index if not exists batch_payout_items_active_idx
  on batch_payout_items(batch_id, status)
  where status in ('pending', 'processing');
