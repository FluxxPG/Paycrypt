import { Router } from "express";
import { requireJwt, redisRateLimit, requirePasswordSetupComplete } from "../lib/middleware.js";
import { createApiKeyPair } from "../lib/keys.js";
import { hashValue } from "../lib/security.js";
import { query } from "../lib/db.js";
import {
  deleteWalletForMerchant,
  createPaymentIntent,
  createWebhookEndpoint,
  fetchPayment,
  getMerchantCheckoutSettings,
  getSubscriptionSummary,
  listPaymentLedger,
  paymentLedgerBaseQuery,
  listTransactions,
  listSettlements,
  listWallets,
  createWalletVerification,
  confirmWalletVerification,
  approveWalletVerification,
  provisionCustodialWallet,
  registerNonCustodialWallet,
  revokeApiKey,
  revokeWebhookEndpoint,
  rotateApiSecretKey,
  rotateWebhookEndpointSecret,
  updateMerchantCheckoutSettings,
  updateWalletForMerchant,
  updateMerchantSubscription,
  upsertMerchantBinanceCredentials,
  clearMerchantBinanceCredentials,
  getMerchantBinanceStatus
} from "../lib/services.js";
import { upiPaymentService } from "../lib/upi-services.js";
import { getMerchantBillingContext } from "../lib/billing.js";
import { supportedAssets, supportedNetworks } from "@cryptopay/shared";

export const dashboardRouter = Router();

const custodialProvisioningMatrix: Record<string, string[]> = {
  BTC: ["BTC"],
  ETH: ["ERC20"],
  USDT: ["TRC20", "ERC20", "SOL"]
};

dashboardRouter.use(requireJwt, requirePasswordSetupComplete, redisRateLimit("dashboard", 300, 60));

dashboardRouter.get("/overview", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const [
    payments,
    transactions,
    subscription,
    merchantFeatures,
    dailyVolume,
    settlementBreakdown,
    networkBreakdown,
    walletMix,
    dailyUsage,
    recentPayments
  ] = await Promise.all([
    query<{ status: string; count: number; amount: string }>(
      `select status, count(*)::int as count, coalesce(sum(amount_fiat), 0)::numeric as amount
       from payments where merchant_id = $1 group by status`,
      [merchantId]
    ),
    query<{ total: number; volume: string }>(
      `select count(*)::int as total, coalesce(sum(amount_fiat), 0)::numeric as volume
       from payments where merchant_id = $1 and created_at >= date_trunc('month', now())`,
      [merchantId]
    ),
    getSubscriptionSummary(merchantId),
    query<{ custodial_enabled: boolean; non_custodial_enabled: boolean }>(
      `select custodial_enabled, non_custodial_enabled from merchants where id = $1 limit 1`,
      [merchantId]
    ),
    query<{ day: string; count: number; volume: string; settled_volume: string }>(
      `select
          date_trunc('day', ledger.created_at)::date as day,
          count(*)::int as count,
          coalesce(sum(ledger.amount_fiat), 0)::numeric as volume,
          coalesce(sum(ledger.amount_fiat) filter (where ledger.settlement_state = 'settled'), 0)::numeric as settled_volume
       from (${paymentLedgerBaseQuery}) ledger
       where ledger.merchant_id = $1 and ledger.created_at >= now() - interval '14 days'
       group by 1
       order by 1 asc`,
      [merchantId]
    ),
    query<{ settlement_state: string; count: number; volume: string }>(
      `select
          settlement_state,
          count(*)::int as count,
          coalesce(sum(amount_fiat), 0)::numeric as volume
       from (${paymentLedgerBaseQuery}) ledger
       where ledger.merchant_id = $1
       group by settlement_state
       order by count desc`,
      [merchantId]
    ),
    query<{
      settlement_currency: string;
      network: string;
      wallet_type: string;
      wallet_provider: string;
      count: number;
      volume: string;
    }>(
      `select
          settlement_currency,
          network,
          wallet_type,
          wallet_provider,
          count(*)::int as count,
          coalesce(sum(amount_fiat), 0)::numeric as volume
       from (${paymentLedgerBaseQuery}) ledger
       where ledger.merchant_id = $1
       group by settlement_currency, network, wallet_type, wallet_provider
       order by volume desc, count desc`,
      [merchantId]
    ),
    query<{ wallet_type: string; provider: string; count: number }>(
      `select wallet_type, provider, count(*)::int as count
       from wallets
       where merchant_id = $1 and is_active = true
       group by wallet_type, provider
       order by count desc`,
      [merchantId]
    ),
    query<{ day: string; total: number }>(
      `select date_trunc('day', created_at)::date as day, coalesce(sum(quantity), 0)::int as total
       from usage_logs
       where merchant_id = $1 and created_at >= now() - interval '14 days'
       group by 1
       order by 1 asc`,
      [merchantId]
    ),
    query<{
      id: string;
      payment_status: string;
      settlement_state: string;
      amount_fiat: string;
      settlement_currency: string;
      network: string;
      tx_hash: string | null;
      created_at: string;
    }>(
      `select id, payment_status, settlement_state, amount_fiat, settlement_currency, network, tx_hash, created_at
       from (${paymentLedgerBaseQuery}) ledger
       where ledger.merchant_id = $1
       order by created_at desc
       limit 6`,
      [merchantId]
    )
  ]);

  const paymentBreakdown = payments.rows;
  const totalPayments = paymentBreakdown.reduce((sum, item) => sum + Number(item.count), 0);
  const confirmedPayments = paymentBreakdown
    .filter((item) => item.status === "confirmed")
    .reduce((sum, item) => sum + Number(item.count), 0);
  const unsettledStates = new Set(["unsettled", "processing", "awaiting_confirmation"]);
  const unsettledCount = settlementBreakdown.rows
    .filter((item) => unsettledStates.has(item.settlement_state))
    .reduce((sum, item) => sum + Number(item.count), 0);
  const settledCount = settlementBreakdown.rows
    .filter((item) => item.settlement_state === "settled")
    .reduce((sum, item) => sum + Number(item.count), 0);
  const successRate = totalPayments ? Math.round((confirmedPayments / totalPayments) * 100) : 0;
  const walletSummary = walletMix.rows.reduce(
    (acc, item) => {
      acc.total += Number(item.count);
      if (item.wallet_type === "custodial") acc.custodial += Number(item.count);
      if (item.wallet_type === "non_custodial") acc.nonCustodial += Number(item.count);
      return acc;
    },
    { total: 0, custodial: 0, nonCustodial: 0 }
  );

  const responsePayload = {
    metrics: {
      monthlyTransactions: transactions.rows[0]?.total ?? 0,
      monthlyVolume: transactions.rows[0]?.volume ?? 0,
      paymentBreakdown,
      successRate,
      settledCount,
      unsettledCount
    },
    charts: {
      dailyVolume: dailyVolume.rows,
      settlementBreakdown: settlementBreakdown.rows,
      networkBreakdown: networkBreakdown.rows,
      walletMix: walletMix.rows,
      dailyUsage: dailyUsage.rows
    },
    recentPayments: recentPayments.rows,
    walletSummary: {
      ...walletSummary,
      custodialEnabled: merchantFeatures.rows[0]?.custodial_enabled ?? false,
      nonCustodialEnabled: merchantFeatures.rows[0]?.non_custodial_enabled ?? false
    },
    subscription
  };
  res.locals.responsePayload = responsePayload;
  res.json(responsePayload);
});

dashboardRouter.get("/payments/:id", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const payment = await fetchPayment(String(req.params.id), merchantId);
  if (!payment) {
    return res.status(404).json({ message: "Payment not found" });
  }
  res.json(payment);
});

dashboardRouter.get("/transactions", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  res.json({ data: await listTransactions(merchantId) });
});

dashboardRouter.get("/settlements", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  res.json({ data: await listSettlements(merchantId) });
});

dashboardRouter.get("/payments", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  res.json({ data: await listPaymentLedger(merchantId) });
});

dashboardRouter.get("/subscriptions", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  res.json(await getSubscriptionSummary(merchantId));
});

dashboardRouter.get("/settings", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  res.json(await getMerchantCheckoutSettings(merchantId));
});

dashboardRouter.patch("/settings", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const responsePayload = await updateMerchantCheckoutSettings(merchantId, req.body);
  res.locals.responsePayload = responsePayload;
  res.json(responsePayload);
});

dashboardRouter.post("/checkout-preview", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const { amountFiat, fiatCurrency, settlementCurrency, network, description } = req.body as {
    amountFiat: number;
    fiatCurrency?: string;
    settlementCurrency?: string;
    network?: string;
    description?: string;
  };

  const responsePayload = await createPaymentIntent(merchantId, {
    amountFiat,
    fiatCurrency: fiatCurrency ?? "INR",
    settlementCurrency,
    network,
    description: description ?? "Merchant checkout preview",
    successUrl: `${process.env.APP_BASE_URL}/preview/success`,
    cancelUrl: `${process.env.APP_BASE_URL}/preview/cancel`,
    metadata: {
      preview: "true",
      source: "merchant_settings"
    }
  });

  res.locals.responsePayload = responsePayload;
  res.status(201).json(responsePayload);
});

dashboardRouter.post("/checkout-preview/non-custodial", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const { amountFiat, fiatCurrency, settlementCurrency, network, description } = req.body as {
    amountFiat: number;
    fiatCurrency?: string;
    settlementCurrency?: string;
    network?: string;
    description?: string;
  };

  const responsePayload = await createPaymentIntent(
    merchantId,
    {
      amountFiat,
      fiatCurrency: fiatCurrency ?? "INR",
      settlementCurrency,
      network,
      description: description ?? "Non-custodial checkout preview",
      successUrl: `${process.env.APP_BASE_URL}/preview/success`,
      cancelUrl: `${process.env.APP_BASE_URL}/preview/cancel`,
      metadata: {
        preview: "true",
        source: "merchant_settings",
        previewMode: "non_custodial"
      }
    },
    { walletPreference: "non_custodial_only" }
  );

  res.locals.responsePayload = responsePayload;
  res.status(201).json(responsePayload);
});

dashboardRouter.post("/checkout-preview/upi", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const { amountFiat, fiatCurrency, description, provider } = req.body as {
    amountFiat?: number;
    fiatCurrency?: string;
    description?: string;
    provider?: "auto" | "phonepe" | "paytm" | "razorpay" | "freecharge";
  };
  const merchantAmountResult = await query<{ upi_default_amount_fiat: string }>(
    `select upi_default_amount_fiat from merchants where id = $1 limit 1`,
    [merchantId]
  );
  const resolvedAmount = amountFiat ?? Number(merchantAmountResult.rows[0]?.upi_default_amount_fiat ?? 999);
  const responsePayload = await upiPaymentService.createPaymentIntent(merchantId, {
    amountFiat: resolvedAmount,
    fiatCurrency: fiatCurrency ?? "INR",
    method: "upi",
    provider: provider ?? "auto",
    description: description ?? "UPI checkout preview",
    expiresInMinutes: 30,
    successUrl: `${process.env.APP_BASE_URL}/preview/success`,
    cancelUrl: `${process.env.APP_BASE_URL}/preview/cancel`,
    metadata: {
      preview: "true",
      source: "merchant_settings",
      previewMode: "upi"
    }
  });
  res.locals.responsePayload = responsePayload;
  res.status(201).json(responsePayload);
});

dashboardRouter.get("/wallets", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const [wallets, billingContext, merchantResult] = await Promise.all([
    listWallets(merchantId),
    getMerchantBillingContext(merchantId),
    query<{ custodial_enabled: boolean }>(`select custodial_enabled from merchants where id = $1 limit 1`, [merchantId])
  ]);
  res.json({
    data: wallets,
    capabilities: {
      custodialEnabled: merchantResult.rows[0]?.custodial_enabled ?? true,
      nonCustodialEnabled: billingContext.plan.nonCustodialEnabled && billingContext.merchantNonCustodialEnabled,
      planCode: billingContext.planCode,
      priorityProcessing: billingContext.plan.priorityProcessing,
      nonCustodialWalletLimit: billingContext.nonCustodialWalletLimit,
      platformFeePercent: billingContext.platformFeePercent
    },
    custodialProvisioning: Object.entries(custodialProvisioningMatrix).flatMap(([asset, networks]) =>
      networks.map((network) => ({
        asset,
        network
      }))
    )
  });
});

dashboardRouter.get("/wallets/binance", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const responsePayload = await getMerchantBinanceStatus(merchantId);
  res.locals.responsePayload = responsePayload;
  res.json(responsePayload);
});

dashboardRouter.put("/wallets/binance", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const { apiKey, apiSecret } = req.body as { apiKey: string; apiSecret: string };
  if (!apiKey || !apiSecret) {
    return res.status(400).json({ message: "apiKey and apiSecret are required" });
  }
  const responsePayload = await upsertMerchantBinanceCredentials(merchantId, { apiKey, apiSecret });
  res.locals.responsePayload = responsePayload;
  res.json(responsePayload);
});

dashboardRouter.delete("/wallets/binance", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const responsePayload = await clearMerchantBinanceCredentials(merchantId);
  res.locals.responsePayload = responsePayload;
  res.json(responsePayload);
});

dashboardRouter.post("/wallets", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const { asset, network, address, provider } = req.body as {
    asset: string;
    network: string;
    address: string;
    provider?: string;
  };

  if (!supportedAssets.includes(asset as any) || !supportedNetworks.includes(network as any)) {
    return res.status(400).json({ message: "Unsupported asset or network" });
  }
  if (network === "BTC") {
    return res.status(400).json({ message: "BTC is custodial-only; register a TRC20, ERC20, or SOL wallet." });
  }

  const responsePayload = await registerNonCustodialWallet(merchantId, { asset, network, address, provider });
  res.locals.responsePayload = responsePayload;
  res.status(201).json(responsePayload);
});

dashboardRouter.post("/wallets/custodial", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const { asset, network } = req.body as { asset: string; network: string };

  if (!supportedAssets.includes(asset as any) || !supportedNetworks.includes(network as any)) {
    return res.status(400).json({ message: "Unsupported asset or network" });
  }
  if (!(custodialProvisioningMatrix[asset] ?? []).includes(network)) {
    return res.status(400).json({ message: `Custodial routing is not supported for ${asset} on ${network}` });
  }

  const responsePayload = await provisionCustodialWallet(merchantId, { asset, network });
  res.locals.responsePayload = responsePayload;
  res.status(201).json(responsePayload);
});

dashboardRouter.patch("/wallets/:id", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const { isActive, isSelected } = req.body as { isActive?: boolean; isSelected?: boolean };
  const responsePayload = await updateWalletForMerchant(merchantId, req.params.id, { isActive, isSelected });
  res.locals.responsePayload = responsePayload;
  res.json({ data: responsePayload });
});

dashboardRouter.delete("/wallets/:id", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const responsePayload = await deleteWalletForMerchant(merchantId, req.params.id);
  res.locals.responsePayload = responsePayload;
  res.json(responsePayload);
});

dashboardRouter.post("/wallets/verify", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const { asset, network, address } = req.body as {
    asset: string;
    network: string;
    address: string;
  };
  const responsePayload = await createWalletVerification(merchantId, { asset, network, address });
  res.locals.responsePayload = responsePayload;
  res.status(201).json(responsePayload);
});

dashboardRouter.post("/wallets/verify/:id/approve", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const responsePayload = await approveWalletVerification(req.params.id, merchantId);
  res.locals.responsePayload = responsePayload;
  res.json(responsePayload);
});

dashboardRouter.post("/wallets/verify/:id/confirm", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const { signature } = req.body as { signature: string };
  const responsePayload = await confirmWalletVerification(req.params.id, merchantId, signature);
  res.locals.responsePayload = responsePayload;
  res.json(responsePayload);
});

dashboardRouter.get("/reports", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const [dailyPayments, statusBreakdown, webhookSummary, webhookLogs, usageLogs, transactions, auditLogs, failedPayments] =
    await Promise.all([
      query<{ day: string; count: number; volume: string }>(
        `select date_trunc('day', created_at)::date as day, count(*)::int as count, coalesce(sum(amount_fiat), 0)::numeric as volume
         from payments
         where merchant_id = $1 and created_at >= now() - interval '14 days'
         group by 1
         order by 1 asc`,
        [merchantId]
      ),
      query<{ status: string; count: number; volume: string }>(
        `select status, count(*)::int as count, coalesce(sum(amount_fiat), 0)::numeric as volume
         from payments
         where merchant_id = $1
         group by 1
         order by count desc`,
        [merchantId]
      ),
      query<{ total: number; delivered: number; failed: number }>(
        `select
          count(*)::int as total,
          count(*) filter (where response_status between 200 and 299)::int as delivered,
          count(*) filter (where response_status is null or response_status not between 200 and 299)::int as failed
         from webhook_logs
         where merchant_id = $1 and created_at >= now() - interval '30 days'`,
        [merchantId]
      ),
      query(
        `select event_type, response_status, attempt, delivered_at, next_retry_at, created_at
         from webhook_logs
         where merchant_id = $1
         order by created_at desc
         limit 20`,
        [merchantId]
      ),
      query(
        `select event_type, sum(quantity)::int as total
         from usage_logs
         where merchant_id = $1 and created_at >= now() - interval '30 days'
         group by 1
         order by total desc`,
        [merchantId]
      ),
      query(
        `select payment_id, asset, network, amount_crypto, amount_fiat, tx_hash, confirmations, status, created_at
         from transactions
         where merchant_id = $1
         order by created_at desc
         limit 20`,
        [merchantId]
      ),
      query(
        `select actor_id, action, payload, created_at
         from audit_logs
         where merchant_id = $1
         order by created_at desc
         limit 20`,
        [merchantId]
      ),
      query(
        `select id, status, created_at
         from payments
         where merchant_id = $1 and status = 'failed'
         order by created_at desc
         limit 10`,
        [merchantId]
      )
    ]);

  res.json({
    dailyPayments: dailyPayments.rows,
    statusBreakdown: statusBreakdown.rows,
    webhookSummary: webhookSummary.rows[0] ?? { total: 0, delivered: 0, failed: 0 },
    webhookLogs: webhookLogs.rows,
    usageLogs: usageLogs.rows,
    transactions: transactions.rows,
    auditLogs: auditLogs.rows,
    failedPayments: failedPayments.rows
  });
});

dashboardRouter.get("/api-keys", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const result = await query(
    `select id, name, key_type, key_prefix, scopes, rate_limit_per_minute, last_used_at, created_at, is_active
     from api_keys where merchant_id = $1 order by created_at desc`,
    [merchantId]
  );
  res.json({ data: result.rows });
});

dashboardRouter.post("/api-keys", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const { name, scopes, rateLimitPerMinute } = req.body as {
    name: string;
    scopes: string[];
    rateLimitPerMinute?: number;
  };
  const { publicKey, secretKey } = createApiKeyPair();
  const secretHash = await hashValue(secretKey);
  const publicHash = await hashValue(publicKey);
  const keyRateLimit = rateLimitPerMinute ?? 120;

  await query(
    `insert into api_keys (merchant_id, name, key_type, key_prefix, key_hash, scopes, is_active, rate_limit_per_minute)
     values
     ($1,$2,'public',$3,$4,$5,true,$6),
     ($1,$2,'secret',$7,$8,$5,true,$6)`,
    [merchantId, name, publicKey.slice(0, 15), publicHash, scopes, keyRateLimit, secretKey.slice(0, 15), secretHash]
  );

  const responsePayload = { publicKey, secretKey, rateLimitPerMinute: keyRateLimit };
  res.locals.responsePayload = responsePayload;
  res.status(201).json(responsePayload);
});

dashboardRouter.post("/webhooks", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const responsePayload = await createWebhookEndpoint(merchantId, req.body);
  res.locals.responsePayload = responsePayload;
  res.status(201).json(responsePayload);
});

dashboardRouter.get("/webhooks", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const result = await query(
    `select id, target_url, events, is_active, secret_version, last_rotated_at, created_at
     from webhook_endpoints where merchant_id = $1 order by created_at desc`,
    [merchantId]
  );
  res.json({ data: result.rows });
});

dashboardRouter.delete("/webhooks/:id", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const result = await revokeWebhookEndpoint(merchantId, req.params.id);
  if (!result) {
    return res.status(404).json({ message: "Webhook endpoint not found" });
  }
  res.json({ success: true });
});

dashboardRouter.post("/webhooks/:id/rotate", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const responsePayload = await rotateWebhookEndpointSecret(merchantId, req.params.id);
  res.locals.responsePayload = responsePayload;
  res.json(responsePayload);
});

dashboardRouter.post("/api-keys/:id/rotate", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const responsePayload = await rotateApiSecretKey(merchantId, req.params.id);
  res.locals.responsePayload = responsePayload;
  res.status(201).json(responsePayload);
});

dashboardRouter.delete("/api-keys/:id", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  await revokeApiKey(merchantId, req.params.id);
  res.json({ success: true });
});

dashboardRouter.post("/subscriptions/plan", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const { planCode } = req.body as { planCode: "starter" | "custom_selective" | "custom_enterprise" };
  if (planCode === "custom_enterprise") {
    res.status(403).json({
      error: "custom_enterprise_requires_admin",
      message: "Custom Enterprise requires an admin override"
    });
    return;
  }
  const responsePayload = await updateMerchantSubscription(merchantId, planCode, {
    actorId: (req as any).actor.userId
  });
  res.locals.responsePayload = responsePayload;
  res.json(responsePayload);
});
