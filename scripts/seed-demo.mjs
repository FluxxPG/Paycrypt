import "dotenv/config";
import dns from "node:dns";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const originalLookup = dns.lookup.bind(dns);
dns.lookup = (hostname, options, callback) => {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  const normalized = typeof options === "number" ? { family: options } : { ...(options ?? {}) };
  if (typeof hostname === "string" && hostname.includes(".supabase.co")) {
    normalized.family = 4;
  }

  return originalLookup(hostname, normalized, callback);
};

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(
    process.env.DATABASE_URL.includes(".supabase.co") || process.env.DATABASE_URL.includes("sslmode=")
      ? { ssl: { rejectUnauthorized: false } }
      : {}
  )
});

const merchantId = "mrc_demo";
const adminMerchantId = "mrc_admin";

const hash = (value) => bcrypt.hash(value, 12);
const now = () => new Date();

async function main() {
  const merchantPassword = await hash("ChangeMe123!");
  const adminPassword = await hash("AdminChangeMe123!");
  const publicKey = `pk_live_${nanoid(24)}`;
  const secretKey = `sk_live_${nanoid(36)}`;
  const publicHash = await hash(publicKey);
  const secretHash = await hash(secretKey);
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
     ($1, 'custodial', 'binance', 'ETH', 'ERC20', 'erc20_demo_wallet', true),
     ($1, 'custodial', 'binance', 'BTC', 'BTC', 'btc_demo_wallet', true),
     ($1, 'non_custodial', 'merchant', 'USDT', 'SOL', 'sol_demo_wallet', true)
     on conflict do nothing`,
    [merchantId]
  );

  const walletByNetwork = {
    TRC20: "trc20_demo_wallet",
    ERC20: "erc20_demo_wallet",
    BTC: "btc_demo_wallet",
    SOL: "sol_demo_wallet"
  };
  const providerByNetwork = {
    TRC20: "tron",
    ERC20: "ethereum",
    BTC: "binance",
    SOL: "solana"
  };
  const priceByAsset = {
    USDT: 83,
    ETH: 285000,
    BTC: 5600000
  };
  const templates = [
    { asset: "USDT", network: "TRC20", status: "confirmed", amountFiat: 24999, customerName: "Asha Rao" },
    { asset: "ETH", network: "ERC20", status: "pending", amountFiat: 120000, customerName: "Orbit Labs" },
    { asset: "BTC", network: "BTC", status: "confirmed", amountFiat: 780000, customerName: "Northwind Retail" },
    { asset: "USDT", network: "SOL", status: "created", amountFiat: 18500, customerName: "Lumen Apps" },
    { asset: "USDT", network: "TRC20", status: "failed", amountFiat: 42000, customerName: "Delta Foods" },
    { asset: "ETH", network: "ERC20", status: "confirmed", amountFiat: 315000, customerName: "Studio Vertex" }
  ];

  for (let index = 0; index < 18; index += 1) {
    const template = templates[index % templates.length];
    const createdAt = new Date(Date.now() - index * 24 * 60 * 60 * 1000 - (index % 5) * 60 * 60 * 1000);
    const paymentId = `pay_seed_${String(index).padStart(2, "0")}`;
    const exchangeRate = priceByAsset[template.asset];
    const amountCrypto = (template.amountFiat / exchangeRate).toFixed(8);
    const txHash = template.status === "created" ? null : `seed_tx_${String(index).padStart(2, "0")}`;
    const confirmations =
      template.status === "confirmed" ? (template.network === "BTC" ? 3 : template.network === "TRC20" ? 24 : 14) : template.status === "pending" ? 1 : 0;

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
      ) values (
        $1,$2,$3,$4,$5,'seed',$6,'INR',$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,
        $17,$18,$19,$6,$6
      )
      on conflict (id) do update set
        amount_fiat = excluded.amount_fiat,
        amount_crypto = excluded.amount_crypto,
        exchange_rate = excluded.exchange_rate,
        settlement_currency = excluded.settlement_currency,
        network = excluded.network,
        customer_email = excluded.customer_email,
        customer_name = excluded.customer_name,
        description = excluded.description,
        metadata = excluded.metadata,
        wallet_address = excluded.wallet_address,
        status = excluded.status,
        confirmations = excluded.confirmations,
        tx_hash = excluded.tx_hash,
        expires_at = excluded.expires_at,
        updated_at = excluded.updated_at`,
      [
        paymentId,
        merchantId,
        template.amountFiat + index * 1750,
        amountCrypto,
        exchangeRate,
        createdAt,
        template.asset,
        template.network,
        `buyer+${index}@example.com`,
        template.customerName,
        `Demo invoice #${1001 + index}`,
        JSON.stringify({ source: "seed", cohort: "merchant-analytics", index }),
        walletByNetwork[template.network],
        template.status,
        confirmations,
        txHash,
        new Date(createdAt.getTime() + 20 * 60 * 1000),
        "https://example.com/success",
        "https://example.com/cancel"
      ]
    );

    if (template.status === "confirmed" || template.status === "pending") {
      const transactionStatus = template.status === "confirmed" ? "confirmed" : "pending";
      const transactionResult = await db.query(
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
          source_type,
          created_at
        ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'payment',$10)
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
        [paymentId, merchantId, template.asset, template.network, amountCrypto, template.amountFiat + index * 1750, txHash, confirmations, transactionStatus, createdAt]
      );

      if (template.status === "confirmed" && index % 4 !== 1) {
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
          ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'processed',$10::jsonb,$11,$11,$11)
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
            updated_at = excluded.updated_at`,
          [
            merchantId,
            paymentId,
            transactionResult.rows[0].id,
            providerByNetwork[template.network],
            template.asset,
            template.network,
            amountCrypto,
            template.amountFiat + index * 1750,
            txHash,
            JSON.stringify({ seeded: true, kind: "settlement", index }),
            new Date(createdAt.getTime() + 45 * 60 * 1000)
          ]
        );
      }
    }

    await db.query(
      `insert into usage_logs (merchant_id, event_type, quantity, created_at)
       values
       ($1,'payment.create',$2,$3),
       ($1,'payments:read',$4,$3),
       ($1,'transactions:read',$5,$3)
       on conflict do nothing`,
      [merchantId, 1 + (index % 3), createdAt, 6 + (index % 4), 3 + (index % 2)]
    );
  }

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
