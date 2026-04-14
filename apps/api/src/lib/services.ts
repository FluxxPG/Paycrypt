import type { PaymentStatus, RealtimeEventName } from "@cryptopay/shared";
import {
  createPaymentLinkSchema,
  createPaymentSchema,
  createWebhookEndpointSchema,
  supportedAssets,
  supportedNetworks,
  planCatalog
} from "@cryptopay/shared";
import { createApiKeyPair, createPaymentLinkReference, createPaymentReference } from "./keys.js";
import { verifyMessage } from "ethers";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import TronWeb from "tronweb";
import { getBinanceDepositAddress } from "./binance.js";
import { nanoid } from "nanoid";
import { query, withTransaction } from "./db.js";
import { emitPaymentEvent } from "./realtime.js";
import { decryptSecret, encryptSecret, hmacSignWithSecret, hashValue } from "./security.js";
import { queues } from "./queue.js";
import {
  assertMerchantCanAcceptPayment,
  assertMerchantPlatformAccess,
  changeSubscriptionPlan,
  getMerchantBillingContext,
  listBillingInvoices
} from "./billing.js";
import { AppError } from "./errors.js";
import { quoteCryptoAmount } from "./pricing.js";
import { recordPaymentStatus } from "./telemetry.js";

export const persistResponse = <T>(payload: T) => payload;
export { listBillingInvoices };

const getSelectedNonCustodialWallet = async (
  merchantId: string,
  asset: string,
  network: string
) => {
  const result = await query<{
    id: string;
    address: string;
    provider: string;
  }>(
    `select address, provider
     from wallets
     where merchant_id = $1
       and wallet_type = 'non_custodial'
       and asset = $2
       and network = $3
       and is_active = true
       and payment_id is null
     order by is_selected desc, created_at desc
     limit 1`,
    [merchantId, asset, network]
  );
  return result.rows[0] ?? null;
};

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

  const walletRoutes: Record<
    string,
    {
      asset: string;
      network: string;
      address: string;
      provider: string;
      walletType: "custodial" | "non_custodial";
      amountCrypto: number;
      exchangeRate: number;
      sourceWalletId?: string;
    }
  > = {};

  for (const network of supportedRouteNetworks) {
    const nonCustodialWallet = await getSelectedNonCustodialWallet(merchantId, parsed.settlementCurrency, network);
    if (nonCustodialWallet) {
      walletRoutes[network] = {
        asset: parsed.settlementCurrency,
        network,
        address: nonCustodialWallet.address,
        provider: nonCustodialWallet.provider ?? "merchant",
        walletType: "non_custodial",
        amountCrypto: quote.amountCrypto,
        exchangeRate: quote.exchangeRate,
        sourceWalletId: nonCustodialWallet.id
      };
      continue;
    }

    const deposit = await getBinanceDepositAddress(parsed.settlementCurrency, network);
    walletRoutes[network] = {
      asset: parsed.settlementCurrency,
      network,
      address: deposit.address,
      provider: "binance",
      walletType: "custodial",
      amountCrypto: quote.amountCrypto,
      exchangeRate: quote.exchangeRate
    };
  }
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
      if (route.sourceWalletId) {
        await client.query(
          `update wallets
           set payment_id = $2, is_selected = $3, last_seen_at = null
           where id = $1`,
          [route.sourceWalletId, paymentId, network === parsed.network]
        );
      } else {
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

export const registerNonCustodialWallet = async (
  merchantId: string,
  input: {
    asset: string;
    network: string;
    address: string;
    provider?: string;
  }
) => {
  const [merchantResult, billingContext] = await Promise.all([
    query<{ non_custodial_enabled: boolean }>("select non_custodial_enabled from merchants where id = $1", [merchantId]),
    getMerchantBillingContext(merchantId)
  ]);
  if (!merchantResult.rows[0]?.non_custodial_enabled || !billingContext.plan.nonCustodialEnabled) {
    throw new AppError(403, "non_custodial_not_enabled", "Non-custodial wallets require admin approval");
  }

  const result = await query(
    `insert into wallets (
      merchant_id,
      wallet_type,
      provider,
      asset,
      network,
      address,
      is_active,
      is_selected,
      last_seen_at
    ) values ($1,'non_custodial',$2,$3,$4,$5,true,false,null)
    on conflict do nothing
    returning id`,
    [merchantId, input.provider ?? "merchant", input.asset, input.network, input.address]
  );
  if (!result.rows[0]) {
    throw new AppError(409, "wallet_exists", "Wallet address already registered");
  }
  return result.rows[0];
};

export const createWalletVerification = async (
  merchantId: string,
  input: { asset: string; network: string; address: string }
) => {
  const challenge = `cryptopay_verify_${merchantId}_${Date.now()}`;
  const result = await query(
    `insert into non_custodial_wallet_verifications
     (merchant_id, wallet_address, asset, network, challenge_message, status)
     values ($1,$2,$3,$4,$5,'pending')
     returning id, challenge_message`,
    [merchantId, input.address, input.asset, input.network, challenge]
  );
  return result.rows[0];
};

export const approveWalletVerification = async (
  verificationId: string,
  merchantId: string
) => {
  const result = await query(
    `update non_custodial_wallet_verifications
     set status = 'verified', verified_at = now()
     where id = $1 and merchant_id = $2
     returning id, wallet_address, asset, network`,
    [verificationId, merchantId]
  );
  if (!result.rows[0]) {
    throw new AppError(404, "verification_not_found", "Verification not found");
  }
  return result.rows[0];
};

const verifyWalletSignature = async (
  network: string,
  address: string,
  message: string,
  signature: string
) => {
  if (network === "ERC20") {
    const recovered = verifyMessage(message, signature);
    return recovered.toLowerCase() === address.toLowerCase();
  }

  if (network === "SOL") {
    const pubkey = new PublicKey(address);
    const msg = new TextEncoder().encode(message);
    const sigBytes = bs58.decode(signature);
    return nacl.sign.detached.verify(msg, sigBytes, pubkey.toBytes());
  }

  if (network === "TRC20") {
    return TronWeb.utils.crypto.verifyMessage(message, signature, address);
  }

  return false;
};

export const confirmWalletVerification = async (
  verificationId: string,
  merchantId: string,
  signature: string
) => {
  const record = await query<{
    id: string;
    wallet_address: string;
    asset: string;
    network: string;
    challenge_message: string;
    status: string;
  }>(
    `select id, wallet_address, asset, network, challenge_message, status
     from non_custodial_wallet_verifications
     where id = $1 and merchant_id = $2
     limit 1`,
    [verificationId, merchantId]
  );

  const verification = record.rows[0];
  if (!verification) {
    throw new AppError(404, "verification_not_found", "Verification not found");
  }
  if (verification.status !== "pending") {
    throw new AppError(409, "verification_already_processed", "Verification already processed");
  }

  const valid = await verifyWalletSignature(
    verification.network,
    verification.wallet_address,
    verification.challenge_message,
    signature
  );
  if (!valid) {
    throw new AppError(400, "invalid_signature", "Signature verification failed");
  }

  const update = await query(
    `update non_custodial_wallet_verifications
     set status = 'verified', verified_at = now(), signature = $3
     where id = $1 and merchant_id = $2
     returning id, wallet_address, asset, network, status`,
    [verificationId, merchantId, signature]
  );
  return update.rows[0];
};

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

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

export const createMerchantForAdmin = async (input: {
  name: string;
  email: string;
  slug?: string;
  ownerName?: string;
  planCode?: keyof typeof planCatalog;
  actorId: string;
}) => {
  const merchantId = `mrc_${nanoid(10)}`;
  const userId = `usr_${nanoid(10)}`;
  const tempPassword = `Temp${nanoid(8)}!`;
  const passwordHash = await hashValue(tempPassword);
  const slug = (input.slug ? slugify(input.slug) : slugify(input.name)) || `merchant-${nanoid(6)}`;

  await withTransaction(async (client) => {
    await client.query(
      `insert into merchants (id, name, slug, email, status, custodial_enabled, non_custodial_enabled)
       values ($1,$2,$3,$4,'active',true,false)`,
      [merchantId, input.name, slug, input.email]
    );
    await client.query(
      `insert into users (id, merchant_id, full_name, email, password_hash, role)
       values ($1,$2,$3,$4,$5,'merchant')`,
      [userId, merchantId, input.ownerName ?? input.name, input.email, passwordHash]
    );
    await client.query(
      `insert into audit_logs (actor_id, merchant_id, action, payload)
       values ($1,$2,'merchant.created',$3::jsonb)`,
      [input.actorId, merchantId, JSON.stringify({ name: input.name, email: input.email, slug })]
    );
  });

  if (input.planCode) {
    await changeSubscriptionPlan(merchantId, input.planCode, { actorId: input.actorId });
  }

  const merchant = await query("select * from merchants where id = $1", [merchantId]).then((res) => res.rows[0]);
  return { merchant, tempPassword };
};

export const updateMerchantForAdmin = async (
  merchantId: string,
  input: {
    name?: string;
    email?: string;
    status?: string;
    webhookBaseUrl?: string | null;
    custodialEnabled?: boolean;
  },
  actorId: string
) => {
  const result = await query(
    `update merchants
     set
       name = coalesce($2, name),
       email = coalesce($3, email),
       status = coalesce($4, status),
       webhook_base_url = coalesce($5, webhook_base_url),
       custodial_enabled = coalesce($6, custodial_enabled),
       updated_at = now()
     where id = $1
     returning *`,
    [merchantId, input.name ?? null, input.email ?? null, input.status ?? null, input.webhookBaseUrl ?? null, input.custodialEnabled ?? null]
  );

  if (!result.rows[0]) {
    throw new AppError(404, "merchant_not_found", "Merchant not found");
  }

  await query(
    `insert into audit_logs (actor_id, merchant_id, action, payload)
     values ($1,$2,'merchant.updated',$3::jsonb)`,
    [actorId, merchantId, JSON.stringify(input)]
  );
  return result.rows[0];
};

export const disableMerchantForAdmin = async (merchantId: string, actorId: string) => {
  const result = await query(
    `update merchants
     set status = 'disabled', updated_at = now()
     where id = $1
     returning *`,
    [merchantId]
  );
  if (!result.rows[0]) {
    throw new AppError(404, "merchant_not_found", "Merchant not found");
  }
  await query(
    `insert into audit_logs (actor_id, merchant_id, action, payload)
     values ($1,$2,'merchant.disabled',$3::jsonb)`,
    [actorId, merchantId, JSON.stringify({ status: "disabled" })]
  );
  return result.rows[0];
};

export const getMerchantByIdForAdmin = async (merchantId: string) =>
  query("select * from merchants where id = $1", [merchantId]).then((res) => res.rows[0] ?? null);

export const listWalletsForAdmin = async (merchantId: string) => listWallets(merchantId);

export const updateWalletForAdmin = async (
  walletId: string,
  input: { isActive?: boolean; isSelected?: boolean },
  actorId: string
) => {
  return withTransaction(async (client) => {
    const walletResult = await client.query<{
      id: string;
      merchant_id: string;
      asset: string;
      network: string;
    }>(
      `select id, merchant_id, asset, network from wallets where id = $1 limit 1`,
      [walletId]
    );
    const wallet = walletResult.rows[0];
    if (!wallet) {
      throw new AppError(404, "wallet_not_found", "Wallet not found");
    }

    if (input.isSelected) {
      await client.query(
        `update wallets
         set is_selected = false
         where merchant_id = $1 and asset = $2 and network = $3`,
        [wallet.merchant_id, wallet.asset, wallet.network]
      );
    }

    const result = await client.query(
      `update wallets
       set is_active = coalesce($2, is_active),
           is_selected = coalesce($3, is_selected)
       where id = $1
       returning *`,
      [walletId, input.isActive ?? null, input.isSelected ?? null]
    );

    await client.query(
      `insert into audit_logs (actor_id, merchant_id, action, payload)
       values ($1,$2,'wallet.updated',$3::jsonb)`,
      [actorId, wallet.merchant_id, JSON.stringify({ walletId, ...input })]
    );

    return result.rows[0];
  });
};

export const listSubscriptionsForAdmin = async () =>
  query(
    `select s.*, m.name as merchant_name, m.email as merchant_email
     from subscriptions s
     join merchants m on m.id = s.merchant_id
     order by s.updated_at desc`
  ).then((res) => res.rows);

export const listInvoicesForAdmin = async () =>
  query(
    `select i.*, m.name as merchant_name
     from billing_invoices i
     join merchants m on m.id = i.merchant_id
     order by i.created_at desc
     limit 50`
  ).then((res) => res.rows);

export const listApiKeysForAdmin = async (merchantId?: string) =>
  query(
    `select
        k.id,
        k.name,
        k.key_type,
        k.key_prefix,
        k.scopes,
        k.rate_limit_per_minute,
        k.last_used_at,
        k.created_at,
        k.is_active,
        m.id as merchant_id,
        m.name as merchant_name,
        m.email as merchant_email
     from api_keys k
     join merchants m on m.id = k.merchant_id
     ${merchantId ? "where k.merchant_id = $1" : ""}
     order by k.created_at desc`,
    merchantId ? [merchantId] : []
  ).then((res) => res.rows);

export const createApiKeysForAdmin = async (input: {
  merchantId: string;
  name: string;
  scopes: string[];
  rateLimitPerMinute?: number;
  actorId: string;
}) => {
  const { publicKey, secretKey } = createApiKeyPair();
  const secretHash = await hashValue(secretKey);
  const publicHash = await hashValue(publicKey);
  const keyRateLimit = input.rateLimitPerMinute ?? 120;

  await query(
    `insert into api_keys (merchant_id, name, key_type, key_prefix, key_hash, scopes, is_active, rate_limit_per_minute)
     values
     ($1,$2,'public',$3,$4,$5,true,$6),
     ($1,$2,'secret',$7,$8,$5,true,$6)`,
    [
      input.merchantId,
      input.name,
      publicKey.slice(0, 15),
      publicHash,
      input.scopes,
      keyRateLimit,
      secretKey.slice(0, 15),
      secretHash
    ]
  );

  await query(
    `insert into audit_logs (actor_id, merchant_id, action, payload)
     values ($1,$2,'api_keys.created',$3::jsonb)`,
    [input.actorId, input.merchantId, JSON.stringify({ name: input.name, scopes: input.scopes })]
  );

  return { publicKey, secretKey, rateLimitPerMinute: keyRateLimit };
};

export const rotateApiKeyForAdmin = async (merchantId: string, keyId: string, actorId: string) => {
  const result = await rotateApiSecretKey(merchantId, keyId);
  await query(
    `insert into audit_logs (actor_id, merchant_id, action, payload)
     values ($1,$2,'api_keys.rotated',$3::jsonb)`,
    [actorId, merchantId, JSON.stringify({ keyId })]
  );
  return result;
};

export const revokeApiKeyForAdmin = async (merchantId: string, keyId: string, actorId: string) => {
  const result = await revokeApiKey(merchantId, keyId);
  await query(
    `insert into audit_logs (actor_id, merchant_id, action, payload)
     values ($1,$2,'api_keys.revoked',$3::jsonb)`,
    [actorId, merchantId, JSON.stringify({ keyId })]
  );
  return result;
};

export const listWebhookEndpointsForAdmin = async (merchantId?: string) =>
  query(
    `select
        w.id,
        w.target_url,
        w.events,
        w.is_active,
        w.secret_version,
        w.last_rotated_at,
        w.created_at,
        m.id as merchant_id,
        m.name as merchant_name,
        m.email as merchant_email
     from webhook_endpoints w
     join merchants m on m.id = w.merchant_id
     ${merchantId ? "where w.merchant_id = $1" : ""}
     order by w.created_at desc`,
    merchantId ? [merchantId] : []
  ).then((res) => res.rows);

export const toggleWebhookEndpointForAdmin = async (
  merchantId: string,
  endpointId: string,
  isActive: boolean,
  actorId: string
) => {
  const result = await query(
    `update webhook_endpoints
     set is_active = $3
     where id = $1 and merchant_id = $2
     returning id, is_active`,
    [endpointId, merchantId, isActive]
  );
  if (!result.rows[0]) {
    throw new AppError(404, "webhook_endpoint_not_found", "Webhook endpoint not found");
  }
  await query(
    `insert into audit_logs (actor_id, merchant_id, action, payload)
     values ($1,$2,'webhook.updated',$3::jsonb)`,
    [actorId, merchantId, JSON.stringify({ endpointId, isActive })]
  );
  return result.rows[0];
};

export const rotateWebhookEndpointForAdmin = async (
  merchantId: string,
  endpointId: string,
  actorId: string
) => {
  const result = await rotateWebhookEndpointSecret(merchantId, endpointId);
  await query(
    `insert into audit_logs (actor_id, merchant_id, action, payload)
     values ($1,$2,'webhook.rotated',$3::jsonb)`,
    [actorId, merchantId, JSON.stringify({ endpointId })]
  );
  return result;
};

export const revokeWebhookEndpointForAdmin = async (merchantId: string, endpointId: string, actorId: string) => {
  const result = await revokeWebhookEndpoint(merchantId, endpointId);
  if (!result) {
    throw new AppError(404, "webhook_endpoint_not_found", "Webhook endpoint not found");
  }
  await query(
    `insert into audit_logs (actor_id, merchant_id, action, payload)
     values ($1,$2,'webhook.revoked',$3::jsonb)`,
    [actorId, merchantId, JSON.stringify({ endpointId })]
  );
  return result;
};

export const listWebhookLogsForAdmin = async (merchantId?: string) =>
  query(
    `select
        w.event_type,
        w.response_status,
        w.attempt,
        w.delivered_at,
        w.next_retry_at,
        w.created_at,
        m.id as merchant_id,
        m.name as merchant_name
     from webhook_logs w
     join merchants m on m.id = w.merchant_id
     ${merchantId ? "where w.merchant_id = $1" : ""}
     order by w.created_at desc
     limit 50`,
    merchantId ? [merchantId] : []
  ).then((res) => res.rows);

export const listWalletVerificationsForAdmin = async (merchantId?: string) =>
  query(
    `select
        id,
        merchant_id,
        wallet_address,
        asset,
        network,
        challenge_message,
        status,
        created_at,
        verified_at
     from non_custodial_wallet_verifications
     ${merchantId ? "where merchant_id = $1" : ""}
     order by created_at desc`,
    merchantId ? [merchantId] : []
  ).then((res) => res.rows);

export const approveWalletVerificationForAdmin = async (
  verificationId: string,
  merchantId: string,
  actorId: string
) => {
  const result = await approveWalletVerification(verificationId, merchantId);
  const existing = await query(
    `select id from wallets
     where merchant_id = $1 and wallet_type = 'non_custodial' and asset = $2 and network = $3 and address = $4
     limit 1`,
    [merchantId, result.asset, result.network, result.wallet_address]
  );

  if (!existing.rows[0]) {
    const selectedResult = await query(
      `select id from wallets
       where merchant_id = $1 and asset = $2 and network = $3 and is_selected = true
       limit 1`,
      [merchantId, result.asset, result.network]
    );
    const shouldSelect = !selectedResult.rows[0];
    await query(
      `insert into wallets (
        merchant_id, wallet_type, provider, asset, network, address, is_active, is_selected, last_seen_at
      ) values ($1,'non_custodial','merchant',$2,$3,$4,true,$5,null)`,
      [merchantId, result.asset, result.network, result.wallet_address, shouldSelect]
    );
  }
  await query(
    `insert into audit_logs (actor_id, merchant_id, action, payload)
     values ($1,$2,'wallet.verification.approved',$3::jsonb)`,
    [actorId, merchantId, JSON.stringify({ verificationId })]
  );
  return result;
};

export const listSystemAlerts = async () =>
  query(
    `select id, severity, source, message, metadata, resolved_at, created_at
     from system_alerts
     order by created_at desc
     limit 50`
  ).then((res) => res.rows);

export const createSystemAlert = async (input: {
  severity: "info" | "warning" | "critical";
  source: string;
  message: string;
  metadata?: Record<string, unknown>;
}) => {
  await query(
    `insert into system_alerts (severity, source, message, metadata)
     values ($1,$2,$3,$4::jsonb)`,
    [input.severity, input.source, input.message, JSON.stringify(input.metadata ?? {})]
  );
};

export const resolveSystemAlert = async (alertId: string) => {
  const result = await query(
    `update system_alerts set resolved_at = now() where id = $1 returning id`,
    [alertId]
  );
  return result.rows[0] ?? null;
};

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
