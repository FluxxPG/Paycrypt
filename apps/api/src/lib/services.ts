import type { PaymentStatus, RealtimeEventName } from "@cryptopay/shared";
import {
  createPaymentLinkSchema,
  createPaymentSchema,
  createWebhookEndpointSchema,
  supportedAssets,
  supportedNetworks,
  planCatalog
} from "@cryptopay/shared";
import { createPaymentLinkReference, createPaymentReference, createWalletAddress } from "./keys.js";
import { query, withTransaction } from "./db.js";
import { emitPaymentEvent } from "./realtime.js";
import { decryptSecret, encryptSecret, hmacSignWithSecret, hashValue } from "./security.js";
import { queues } from "./queue.js";
import {
  assertMerchantCanAcceptPayment,
  assertMerchantPlatformAccess,
  changeSubscriptionPlan,
  listBillingInvoices
} from "./billing.js";
import { AppError } from "./errors.js";
import { quoteCryptoAmount } from "./pricing.js";
import { recordPaymentStatus } from "./telemetry.js";

export const persistResponse = <T>(payload: T) => payload;
export { listBillingInvoices };

export const createPaymentIntent = async (merchantId: string, input: unknown) => {
  const parsed = createPaymentSchema.parse(input);
  await assertMerchantCanAcceptPayment(merchantId, parsed.settlementCurrency, parsed.network);
  const paymentId = createPaymentReference();
  const quote = await quoteCryptoAmount(parsed.settlementCurrency, parsed.fiatCurrency, parsed.amountFiat);
  const routeMap: Record<(typeof supportedAssets)[number], (typeof supportedNetworks)[number][]> = {
    BTC: ["BTC"],
    ETH: ["ERC20"],
    USDT: ["TRC20", "ERC20", "SOL"]
  };
  const supportedRouteNetworks = routeMap[parsed.settlementCurrency];
  if (!supportedRouteNetworks.includes(parsed.network)) {
    throw new Error(`Network ${parsed.network} is not supported for ${parsed.settlementCurrency}`);
  }

  const walletRoutes = Object.fromEntries(
    supportedRouteNetworks.map((network) => [
      network,
      {
        asset: parsed.settlementCurrency,
        network,
        address: createWalletAddress(network),
        provider: network === "BTC" ? "binance" : network === "ERC20" ? "ethereum" : network === "TRC20" ? "tron" : "solana",
        walletType: network === "BTC" ? "custodial" : "non_custodial",
        amountCrypto: quote.amountCrypto,
        exchangeRate: quote.exchangeRate
      }
    ])
  );
  const walletAddress = walletRoutes[parsed.network].address;
  const expiresAt = new Date(Date.now() + parsed.expiresInMinutes * 60 * 1000);

  const result = await withTransaction(async (client) => {
    const paymentResult = await client.query<{
      id: string;
      status: PaymentStatus;
    }>(
      `insert into payments (
        id, merchant_id, amount_fiat, amount_crypto, exchange_rate, quote_source, quoted_at, fiat_currency,
        settlement_currency, network, customer_email, customer_name, description, metadata, wallet_address,
        wallet_routes, status, expires_at, success_url, cancel_url
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16::jsonb,'created',$17,$18,$19)
      returning id, status`,
      [
        paymentId,
        merchantId,
        parsed.amountFiat,
        quote.amountCrypto,
        quote.exchangeRate,
        quote.source,
        quote.quotedAt,
        parsed.fiatCurrency,
        parsed.settlementCurrency,
        parsed.network,
        parsed.customerEmail ?? null,
        parsed.customerName ?? null,
        parsed.description,
        JSON.stringify(parsed.metadata),
        walletAddress,
        JSON.stringify(walletRoutes),
        expiresAt,
        parsed.successUrl,
        parsed.cancelUrl
      ]
    );

    for (const [network, route] of Object.entries(walletRoutes)) {
      await client.query(
        `insert into wallets (
          merchant_id, payment_id, wallet_type, provider, asset, network, address, is_active, is_selected, last_seen_at
        ) values ($1,$2,$3,$4,$5,$6,$7,true,$8,null)
        on conflict do nothing`,
        [
          merchantId,
          paymentId,
          route.walletType,
          route.provider,
          route.asset,
          route.network,
          route.address,
          network === parsed.network
        ]
      );
    }

    return paymentResult;
  });

  await logUsage(merchantId, "payment.create", 1);
  await queues.confirmations.add(
    "confirm-check",
    { paymentId },
    {
      jobId: `confirm:${paymentId}`,
      delay: 30_000,
      attempts: 20,
      backoff: {
        type: "exponential",
        delay: 15_000
      },
      removeOnComplete: true,
      removeOnFail: false
    }
  );
  await (walletRoutes[parsed.network].provider === "binance" ? queues.binance : queues.blockchain).add(
    "monitor",
    { paymentId },
    {
      jobId: `monitor:${paymentId}`,
      delay: 15_000,
      attempts: 20,
      backoff: {
        type: "exponential",
        delay: 10_000
      },
      removeOnComplete: true,
      removeOnFail: false
    }
  );
  emitPaymentEvent({
    type: "payment.created",
    paymentId,
    merchantId,
    status: "created"
  });
  void recordPaymentStatus("created").catch((error) => console.error("Failed to record payment telemetry", error));

  return {
    paymentId,
    checkoutUrl: `/pay/${paymentId}`,
    walletAddress,
    walletRoutes,
    amountCrypto: quote.amountCrypto,
    exchangeRate: quote.exchangeRate,
    quotedAt: quote.quotedAt,
    expiresAt,
    status: result.rows[0].status
  };
};

export const fetchPayment = async (paymentId: string, merchantId?: string) => {
  const result = await query(
    `select * from payments where id = $1 ${merchantId ? "and merchant_id = $2" : ""} limit 1`,
    merchantId ? [paymentId, merchantId] : [paymentId]
  );
  return result.rows[0];
};

export const createPaymentLink = async (merchantId: string, input: unknown) => {
  const parsed = createPaymentLinkSchema.parse(input);
  await assertMerchantPlatformAccess(merchantId);
  const linkId = createPaymentLinkReference();

  await query(
    `insert into payment_links (
      id, merchant_id, title, description, amount_fiat, fiat_currency,
      settlement_currency, network, success_url, cancel_url, is_active
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`,
    [
      linkId,
      merchantId,
      parsed.title,
      parsed.description,
      parsed.amountFiat,
      parsed.fiatCurrency,
      parsed.settlementCurrency,
      parsed.network,
      parsed.successUrl,
      parsed.cancelUrl
    ]
  );

  await logUsage(merchantId, "payment_link.create", 1);
  return {
    id: linkId,
    url: `/links/${linkId}`
  };
};

export const fetchPaymentLink = async (linkId: string) => {
  const result = await query("select * from payment_links where id = $1 and is_active = true limit 1", [linkId]);
  return result.rows[0] ?? null;
};

export const createWebhookEndpoint = async (merchantId: string, input: unknown) => {
  const parsed = createWebhookEndpointSchema.parse(input);
  const secret = `whsec_${Math.random().toString(36).slice(2, 18)}`;
  const secretHash = await hashValue(secret);
  const secretCiphertext = encryptSecret(secret);

  const result = await query<{ id: string }>(
    `insert into webhook_endpoints (merchant_id, target_url, events, is_active, secret_hash, secret_ciphertext, secret_version, last_rotated_at)
     values ($1,$2,$3,$4,$5,$6,1,now()) returning id`,
    [merchantId, parsed.url, parsed.events, parsed.isActive, secretHash, secretCiphertext]
  );

  return {
    id: result.rows[0].id,
    secret
  };
};

export const rotateApiSecretKey = async (merchantId: string, keyId: string) => {
  const secretKey = `sk_live_${Math.random().toString(36).slice(2, 38)}`;
  const keyHash = await hashValue(secretKey);
  const result = await query(
    `update api_keys
     set key_prefix = $3, key_hash = $4, is_active = true, last_used_at = null
     where merchant_id = $1 and id = $2 and key_type = 'secret'
     returning id, name, scopes`,
    [merchantId, keyId, secretKey.slice(0, 15), keyHash]
  );

  if (!result.rows[0]) {
    throw new AppError(404, "api_key_not_found", "Secret API key not found");
  }

  return {
    id: result.rows[0].id,
    name: result.rows[0].name,
    scopes: result.rows[0].scopes,
    secretKey
  };
};

export const revokeApiKey = async (merchantId: string, keyId: string) => {
  const result = await query(
    `update api_keys set is_active = false where merchant_id = $1 and id = $2 returning id`,
    [merchantId, keyId]
  );
  if (!result.rows[0]) {
    throw new AppError(404, "api_key_not_found", "API key not found");
  }
  return result.rows[0];
};

export const rotateWebhookEndpointSecret = async (merchantId: string, endpointId: string) => {
  const secret = `whsec_${Math.random().toString(36).slice(2, 18)}`;
  const secretHash = await hashValue(secret);
  const secretCiphertext = encryptSecret(secret);
  const result = await query<{ id: string; secret_version: number }>(
    `update webhook_endpoints
     set secret_hash = $3, secret_ciphertext = $4, secret_version = secret_version + 1, last_rotated_at = now()
     where merchant_id = $1 and id = $2
     returning id, secret_version`,
    [merchantId, endpointId, secretHash, secretCiphertext]
  );

  if (!result.rows[0]) {
    throw new AppError(404, "webhook_endpoint_not_found", "Webhook endpoint not found");
  }

  return {
    id: result.rows[0].id,
    secret,
    secretVersion: result.rows[0].secret_version
  };
};

export const revokeWebhookEndpoint = async (merchantId: string, endpointId: string) => {
  const result = await query(
    `delete from webhook_endpoints where merchant_id = $1 and id = $2 returning id`,
    [merchantId, endpointId]
  );
  return result.rows[0] ?? null;
};

export const dispatchWebhook = async (
  merchantId: string,
  eventType: RealtimeEventName,
  payload: Record<string, unknown>
) => {
  const result = await query<{
    id: string;
    target_url: string;
    secret_ciphertext: string;
  }>(
    "select id, target_url, secret_ciphertext from webhook_endpoints where merchant_id = $1 and is_active = true and $2 = any(events)",
    [merchantId, eventType]
  );

  for (const endpoint of result.rows) {
    const secret = decryptSecret(endpoint.secret_ciphertext);
    await queues.webhooks.add("dispatch", {
      endpointId: endpoint.id,
      merchantId,
      eventType,
      payload,
      signature: hmacSignWithSecret(`${eventType}:${JSON.stringify(payload)}`, secret)
    }, {
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 5000
      },
      removeOnComplete: true,
      removeOnFail: false
    });
  }
};

export const changePaymentStatus = async (
  paymentId: string,
  merchantId: string,
  status: PaymentStatus,
  txHash?: string,
  confirmations = 0
) => {
  await query(
    `update payments
     set status = $2, tx_hash = coalesce($3, tx_hash), confirmations = $4, updated_at = now()
     where id = $1`,
    [paymentId, status, txHash ?? null, confirmations]
  );

  const eventType = `payment.${status}` as RealtimeEventName;
  emitPaymentEvent({ type: eventType, paymentId, merchantId, status, txHash, confirmations });
  void recordPaymentStatus(status).catch((error) => console.error("Failed to record payment telemetry", error));
  await dispatchWebhook(merchantId, eventType, { paymentId, status, txHash, confirmations });
};

export const listTransactions = async (merchantId: string) =>
  query(
    `select * from transactions where merchant_id = $1 order by created_at desc limit 100`,
    [merchantId]
  ).then((res) => res.rows);

export const listSettlements = async (merchantId: string) =>
  query(
    `select
      id,
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
     from settlements
     where merchant_id = $1
     order by created_at desc
     limit 100`,
    [merchantId]
  ).then((res) => res.rows);

export const listWallets = async (merchantId: string) =>
  query(
    `select
      w.id,
      w.payment_id,
      w.wallet_type,
      w.provider,
      w.asset,
      w.network,
      w.address,
      w.is_active,
      w.is_selected,
      w.last_seen_at,
      w.created_at,
      coalesce(count(p.id), 0)::int as payment_count,
      coalesce(sum(case when p.status = 'confirmed' then 1 else 0 end), 0)::int as confirmed_count
     from wallets w
     left join payments p on p.merchant_id = w.merchant_id and p.wallet_address = w.address
     where w.merchant_id = $1
     group by w.id
     order by w.created_at desc
     limit 100`,
    [merchantId]
  ).then((res) => res.rows);

export const getSubscriptionSummary = async (merchantId: string) => {
  const subscriptionResult = await query<{
    id: string;
    merchant_id: string;
    plan_code: string;
    status: string;
    monthly_price_inr: string;
    transaction_limit: number;
    setup_fee_inr: string;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  }>(
    `select * from subscriptions where merchant_id = $1 order by created_at desc limit 1`,
    [merchantId]
  );
  const usageResult = await query<{
    event_type: string;
    total: number;
  }>(
    `select event_type, sum(quantity)::int as total
     from usage_logs where merchant_id = $1 and created_at >= date_trunc('month', now())
     group by event_type`,
    [merchantId]
  );
  const invoices = await listBillingInvoices(merchantId);
  const billing = invoices.reduce(
    (acc, invoice) => {
      const total = Number(invoice.total_inr);
      const paid = Number(invoice.paid_amount_inr);
      acc.invoiceCount += 1;
      acc.totalInvoiced += total;
      acc.paid += paid;
      acc.outstanding += Math.max(0, total - paid);
      acc.overdue += invoice.status === "overdue" ? 1 : 0;
      return acc;
    },
    {
      invoiceCount: 0,
      totalInvoiced: 0,
      paid: 0,
      outstanding: 0,
      overdue: 0,
      currency: "INR"
    }
  );
  return {
    subscription: subscriptionResult.rows[0],
    usage: usageResult.rows,
    billing,
    invoices
  };
};

export const logUsage = async (merchantId: string, eventType: string, quantity: number) => {
  await query(
    "insert into usage_logs (merchant_id, event_type, quantity) values ($1,$2,$3)",
    [merchantId, eventType, quantity]
  );
};

export const listMerchantsForAdmin = async () =>
  query<{
    id: string;
    name: string;
    slug: string;
    email: string;
    status: string;
    custodial_provider: string;
    custodial_enabled: boolean;
    non_custodial_enabled: boolean;
    webhook_base_url: string | null;
    created_at: string;
    updated_at: string;
    plan_code: string | null;
    subscription_status: string | null;
  }>(
    `select m.*, s.plan_code, s.status as subscription_status
     from merchants m
     left join lateral (
       select plan_code, status from subscriptions s
       where s.merchant_id = m.id
       order by s.created_at desc
       limit 1
     ) s on true
     order by m.created_at desc`
  ).then((res) => res.rows);

export const updateMerchantWalletAccess = async (
  merchantId: string,
  nonCustodialEnabled: boolean,
  approvedBy: string
) => {
  await query(
    `update merchants
     set non_custodial_enabled = $2, updated_at = now()
     where id = $1`,
    [merchantId, nonCustodialEnabled]
  );
  await query(
    `insert into audit_logs (actor_id, merchant_id, action, payload)
     values ($1,$2,'wallet_access.updated',$3::jsonb)`,
    [approvedBy, merchantId, JSON.stringify({ nonCustodialEnabled })]
  );
};

export const getPlanDefinition = (planCode: keyof typeof planCatalog) => planCatalog[planCode];

export const updateMerchantSubscription = async (
  merchantId: string,
  planCode: keyof typeof planCatalog,
  overrides?: {
    monthlyPriceInr?: number;
    transactionLimit?: number;
    setupFeeInr?: number;
    status?: string;
    metadata?: Record<string, unknown>;
    actorId?: string;
  }
) => changeSubscriptionPlan(merchantId, planCode, overrides);
