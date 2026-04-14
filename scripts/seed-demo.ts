import "dotenv/config";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const db = new Pool({
  connectionString: process.env.DATABASE_URL
});

const merchantId = "mrc_demo";
const adminMerchantId = "mrc_admin";

const hash = (value: string) => bcrypt.hash(value, 12);
const now = () => new Date();

async function main() {
  const merchantPassword = await hash("ChangeMe123!");
  const adminPassword = await hash("AdminChangeMe123!");
  const publicKey = `pk_live_${nanoid(24)}`;
  const secretKey = `sk_live_${nanoid(36)}`;
  const publicHash = await hash(publicKey);
  const secretHash = await hash(secretKey);
  const confirmedPaymentId = `pay_${nanoid(12)}`;
  const pendingPaymentId = `pay_${nanoid(12)}`;
  const seededAt = now();

  await db.query("begin");

  await db.query(
    `insert into users (id, merchant_id, full_name, email, password_hash, role)
     values
     ($1, $2, $3, $4, $5, 'merchant'),
     ($6, $7, $8, $9, $10, 'super_admin')
     on conflict (email) do update set
       password_hash = excluded.password_hash,
       full_name = excluded.full_name,
       role = excluded.role`,
    [
      `usr_${nanoid(12)}`,
      merchantId,
      "Demo Merchant",
      "owner@nebula.dev",
      merchantPassword,
      `usr_${nanoid(12)}`,
      adminMerchantId,
      "Platform Admin",
      "admin@cryptopay.dev",
      adminPassword
    ]
  );

  await db.query(
    `insert into api_keys (merchant_id, name, key_type, key_prefix, key_hash, scopes, is_active)
     values
     ($1, $2, 'public', $3, $4, $5, true),
     ($1, $2, 'secret', $6, $7, $5, true)
     on conflict do nothing`,
    [
      merchantId,
      "Demo Production Key",
      publicKey.slice(0, 15),
      publicHash,
      [
        "payments:write",
        "payments:read",
        "payment_links:write",
        "transactions:read",
        "webhooks:write",
        "subscriptions:read",
        "billing:read",
        "settlements:read"
      ],
      secretKey.slice(0, 15),
      secretHash
    ]
  );

  await db.query(
    `insert into wallets (merchant_id, wallet_type, provider, asset, network, address, is_active)
     values
     ($1, 'custodial', 'binance', 'USDT', 'TRC20', 'trc20_demo_wallet', true),
     ($1, 'custodial', 'binance', 'ETH', 'ERC20', 'erc20_demo_wallet', true)
     on conflict do nothing`,
    [merchantId]
  );

  await db.query(
    `insert into payments (
      id,
      merchant_id,
      amount_fiat,
      amount_crypto,
      exchange_rate,
      quote_source,
      quoted_at,
      fiat_currency,
      settlement_currency,
      network,
      customer_email,
      customer_name,
      description,
      metadata,
      wallet_address,
      status,
      confirmations,
      tx_hash,
      expires_at,
      success_url,
      cancel_url,
      created_at,
      updated_at
    ) values
    ($1, $2, 24999, 0.99996000, 25000, 'seed', $3, 'INR', 'USDT', 'TRC20', 'buyer@example.com', 'Asha Rao', 'Invoice #1001',
      '{"source":"seed"}'::jsonb, 'trc20_demo_wallet', 'confirmed', 3, 'seed_tx_1',
      now() + interval '20 minutes', 'https://example.com/success', 'https://example.com/cancel', $3, $3),
    ($4, $2, 120000, 4.80000000, 25000, 'seed', $3, 'INR', 'ETH', 'ERC20', 'ops@example.com', 'Orbit Labs', 'Invoice #1002',
      '{"source":"seed"}'::jsonb, 'erc20_demo_wallet', 'pending', 1, 'seed_tx_2',
      now() + interval '20 minutes', 'https://example.com/success', 'https://example.com/cancel', $3, $3)
     on conflict do nothing`,
    [confirmedPaymentId, merchantId, seededAt, pendingPaymentId]
  );

  const transactionResult = await db.query<{ id: string }>(
    `insert into transactions (
      payment_id,
      merchant_id,
      asset,
      network,
      amount_crypto,
      amount_fiat,
      tx_hash,
      confirmations,
      status,
      source_type
    ) values ($1,$2,'USDT','TRC20',0.99996000,24999,'seed_tx_1',3,'confirmed','payment')
     on conflict (payment_id) do update set
       merchant_id = excluded.merchant_id,
       asset = excluded.asset,
       network = excluded.network,
       amount_crypto = excluded.amount_crypto,
       amount_fiat = excluded.amount_fiat,
       tx_hash = excluded.tx_hash,
       confirmations = excluded.confirmations,
       status = excluded.status
     returning id`,
    [confirmedPaymentId, merchantId]
  );

  await db.query(
    `insert into settlements (
      merchant_id,
      payment_id,
      transaction_id,
      provider,
      asset,
      network,
      amount_crypto,
      amount_fiat,
      tx_hash,
      status,
      metadata,
      processed_at,
      created_at,
      updated_at
    ) values ($1,$2,$3,'tron','USDT','TRC20',0.99996000,24999,'seed_tx_1','processed',$4::jsonb,now(),now(),now())
     on conflict (payment_id) do update set
       transaction_id = excluded.transaction_id,
       provider = excluded.provider,
       asset = excluded.asset,
       network = excluded.network,
       amount_crypto = excluded.amount_crypto,
       amount_fiat = excluded.amount_fiat,
       tx_hash = excluded.tx_hash,
       status = excluded.status,
       metadata = excluded.metadata,
       processed_at = excluded.processed_at,
       updated_at = now()`,
    [merchantId, confirmedPaymentId, transactionResult.rows[0].id, '{"seeded":true,"kind":"settlement"}']
  );

  await db.query(
    `insert into subscriptions (merchant_id, plan_code, status, monthly_price_inr, transaction_limit, setup_fee_inr, metadata)
     values
     ($1, 'business', 'active', 15000, 20000, 0, '{"seeded":true}'::jsonb),
     ($2, 'premium', 'active', 35000, 100000, 0, '{"seeded":true}'::jsonb)
     on conflict do nothing`,
    [merchantId, adminMerchantId]
  );

  await db.query(
    `insert into billing_invoices (
      invoice_number,
      merchant_id,
      plan_code,
      status,
      billing_period_start,
      billing_period_end,
      currency,
      subtotal_inr,
      tax_inr,
      total_inr,
      paid_amount_inr,
      due_at,
      metadata
    ) values
    (
      'inv_demo_202604_001',
      $1,
      'business',
      'paid',
      date_trunc('month', now())::date,
      (date_trunc('month', now()) + interval '1 month - 1 day')::date,
      'INR',
      15000,
      2700,
      17700,
      17700,
      now() - interval '2 days',
      '{"seeded":true,"kind":"subscription"}'::jsonb
    ),
    (
      'inv_demo_202604_002',
      $2,
      'premium',
      'issued',
      date_trunc('month', now())::date,
      (date_trunc('month', now()) + interval '1 month - 1 day')::date,
      'INR',
      35000,
      6300,
      41300,
      0,
      now() + interval '7 days',
      '{"seeded":true,"kind":"subscription"}'::jsonb
    )
     on conflict do nothing`,
    [merchantId, adminMerchantId]
  );

  await db.query("commit");

  console.log("Seed complete");
  console.log("Merchant login: owner@nebula.dev / ChangeMe123!");
  console.log("Admin login: admin@cryptopay.dev / AdminChangeMe123!");
  console.log("Public API key:", publicKey);
  console.log("Secret API key:", secretKey);
}

main()
  .catch(async (error) => {
    await db.query("rollback").catch(() => undefined);
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
