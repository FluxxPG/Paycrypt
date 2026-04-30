import { Router } from "express";
import { requireJwt, redisRateLimit, requirePasswordSetupComplete } from "../lib/middleware.js";
import { createApiKeyPair } from "../lib/keys.js";
import { hashValue } from "../lib/security.js";
import { query } from "../lib/db.js";
import { queues } from "../lib/queue.js";
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
import {
  getMerchantTreasurySummary,
  createWithdrawalRequest,
  listWithdrawalRequests,
  listTreasuryAdjustments
} from "../lib/treasury.js";
import {
  createSSOApplication,
  getSSOApplication,
  generateAuthorizationCode,
  validateAuthorizationCode,
  generateAccessToken,
  generateRefreshToken,
  validateAccessToken,
  refreshAccessToken,
  createSSOSession,
  validateSSOSession,
  revokeSSOSession,
  listSSOApplications,
  deleteSSOApplication
} from "../lib/sso.js";
import {
  createBatchPayout,
  processBatchPayout,
  getBatchPayout,
  listBatchPayouts,
  cancelBatchPayout
} from "../lib/batch-payout.js";
import {
  createAutomationRule,
  listAutomationRules,
  updateAutomationRule,
  deleteAutomationRule,
  getAutomationRule
} from "../lib/automation.js";

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
  const trimmedApiKey = String(apiKey ?? "").trim();
  const trimmedApiSecret = String(apiSecret ?? "").trim();
  if (!trimmedApiKey || !trimmedApiSecret) {
    return res.status(400).json({ message: "apiKey and apiSecret are required" });
  }
  const responsePayload = await upsertMerchantBinanceCredentials(merchantId, {
    apiKey: trimmedApiKey,
    apiSecret: trimmedApiSecret
  });
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
  const normalizedAsset = String(asset ?? "").trim().toUpperCase();
  const normalizedNetwork = String(network ?? "").trim().toUpperCase();

  if (!supportedAssets.includes(normalizedAsset as any) || !supportedNetworks.includes(normalizedNetwork as any)) {
    return res.status(400).json({ message: "Unsupported asset or network" });
  }
  if (normalizedNetwork === "BTC") {
    return res.status(400).json({ message: "BTC is custodial-only; register a TRC20, ERC20, or SOL wallet." });
  }

  const responsePayload = await registerNonCustodialWallet(merchantId, {
    asset: normalizedAsset,
    network: normalizedNetwork,
    address,
    provider
  });
  res.locals.responsePayload = responsePayload;
  res.status(201).json(responsePayload);
});

dashboardRouter.post("/wallets/custodial", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const { asset, network } = req.body as { asset: string; network: string };
  const normalizedAsset = String(asset ?? "").trim().toUpperCase();
  const normalizedNetwork = String(network ?? "").trim().toUpperCase();

  if (!supportedAssets.includes(normalizedAsset as any) || !supportedNetworks.includes(normalizedNetwork as any)) {
    return res.status(400).json({ message: "Unsupported asset or network" });
  }
  if (!(custodialProvisioningMatrix[normalizedAsset] ?? []).includes(normalizedNetwork)) {
    return res.status(400).json({
      message: `Custodial routing is not supported for ${normalizedAsset} on ${normalizedNetwork}`
    });
  }

  const responsePayload = await provisionCustodialWallet(merchantId, {
    asset: normalizedAsset,
    network: normalizedNetwork
  });
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
  const { asset, network, address, provider } = req.body as {
    asset: string;
    network: string;
    address: string;
    provider?: string;
  };
  const responsePayload = await createWalletVerification(merchantId, { asset, network, address, provider });
  res.locals.responsePayload = responsePayload;
  res.status(201).json(responsePayload);
});

dashboardRouter.post("/wallets/verify/:id/approve", async (req, res) => {
  res.status(403).json({
    message: "Self-approval is disabled. Complete signature verification or request admin approval."
  });
});

dashboardRouter.post("/wallets/verify/:id/confirm", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const { signature } = req.body as { signature: string };
  if (!String(signature ?? "").trim()) {
    return res.status(400).json({ message: "signature is required" });
  }
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

// Treasury Management Routes for Merchants
dashboardRouter.get("/treasury", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  try {
    const summary = await getMerchantTreasurySummary(merchantId);
    res.json({ data: summary });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch treasury summary", error: (error as Error).message });
  }
});

dashboardRouter.post("/treasury/withdrawals", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  try {
    const input = {
      ...req.body,
      ownerType: "merchant" as const,
      ownerId: merchantId
    };
    const result = await createWithdrawalRequest(input.ownerType, input.ownerId, input);
    res.json({ data: result });
  } catch (error) {
    res.status(500).json({ message: "Failed to create withdrawal request", error: (error as Error).message });
  }
});

dashboardRouter.get("/treasury/withdrawals", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  try {
    const withdrawals = await listWithdrawalRequests("merchant", merchantId);
    res.json({ data: withdrawals });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch withdrawal requests", error: (error as Error).message });
  }
});

dashboardRouter.get("/treasury/adjustments", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  try {
    const adjustments = await listTreasuryAdjustments("merchant", merchantId);
    res.json({ data: adjustments });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch treasury adjustments", error: (error as Error).message });
  }
});

// SSO Management Routes
dashboardRouter.get("/sso/applications", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  try {
    const applications = await listSSOApplications(merchantId);
    res.json({ data: applications });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch SSO applications", error: (error as Error).message });
  }
});

dashboardRouter.post("/sso/applications", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  try {
    const input = {
      ...req.body,
      merchantId
    };
    const application = await createSSOApplication(input);
    res.json({ data: application });
  } catch (error) {
    res.status(500).json({ message: "Failed to create SSO application", error: (error as Error).message });
  }
});

dashboardRouter.delete("/sso/applications/:clientId", async (req, res) => {
  try {
    const { clientId } = req.params;
    const clientIdStr = Array.isArray(clientId) ? clientId[0] : clientId;
    await deleteSSOApplication(clientIdStr);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete SSO application", error: (error as Error).message });
  }
});

dashboardRouter.post("/sso/authorize", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const userId = (req as any).actor.userId;
  try {
    const { clientId, redirectUri, scopes } = req.body as { clientId: string; redirectUri: string; scopes: string[] };
    const code = await generateAuthorizationCode({ clientId, merchantId, userId, redirectUri, scopes });
    res.json({ data: { code } });
  } catch (error) {
    res.status(500).json({ message: "Failed to generate authorization code", error: (error as Error).message });
  }
});

dashboardRouter.post("/sso/token", async (req, res) => {
  try {
    const { grantType, code, clientId, redirectUri, refreshToken } = req.body;

    if (grantType === "authorization_code") {
      const authCode = await validateAuthorizationCode(code, clientId);
      if (!authCode) {
        return res.status(400).json({ message: "Invalid or expired authorization code" });
      }

      // Mark code as used
      await query(`update sso_authorization_codes set used_at = now() where id = $1`, [authCode.id]);

      const accessToken = await generateAccessToken({
        clientId,
        merchantId: authCode.merchant_id,
        userId: authCode.user_id,
        scopes: authCode.scopes
      });

      const refreshTokenResult = await generateRefreshToken({
        accessTokenId: accessToken.accessTokenId,
        clientId,
        merchantId: authCode.merchant_id,
        userId: authCode.user_id
      });

      res.json({
        data: {
          accessToken: accessToken.accessToken,
          refreshToken: refreshTokenResult.refreshToken,
          expiresAt: accessToken.expiresAt
        }
      });
    } else if (grantType === "refresh_token") {
      const tokens = await refreshAccessToken(refreshToken);
      res.json({ data: tokens });
    } else {
      res.status(400).json({ message: "Invalid grant type" });
    }
  } catch (error) {
    res.status(500).json({ message: "Failed to generate access token", error: (error as Error).message });
  }
});

dashboardRouter.post("/sso/session", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const userId = (req as any).actor.userId;
  try {
    const { clientId } = req.body as { clientId?: string };
    const ipAddress = req.ip;
    const userAgent = req.headers["user-agent"];
    const session = await createSSOSession({ merchantId, userId, clientId, ipAddress, userAgent });
    res.json({ data: session });
  } catch (error) {
    res.status(500).json({ message: "Failed to create SSO session", error: (error as Error).message });
  }
});

dashboardRouter.delete("/sso/session/:sessionId", async (req, res) => {
  try {
    const { sessionId } = req.params;
    const sessionIdStr = Array.isArray(sessionId) ? sessionId[0] : sessionId;
    await revokeSSOSession(sessionIdStr);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Failed to revoke SSO session", error: (error as Error).message });
  }
});

// Batch Payout Routes
dashboardRouter.post("/batch-payouts", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  try {
    const input = {
      ...req.body,
      merchantId
    };
    const batch = await createBatchPayout(input);
    res.json({ data: batch });
  } catch (error) {
    res.status(500).json({ message: "Failed to create batch payout", error: (error as Error).message });
  }
});

dashboardRouter.get("/batch-payouts", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  try {
    const batches = await listBatchPayouts(merchantId);
    res.json({ data: batches });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch batch payouts", error: (error as Error).message });
  }
});

dashboardRouter.get("/batch-payouts/:batchId", async (req, res) => {
  try {
    const { batchId } = req.params;
    const batchIdStr = Array.isArray(batchId) ? batchId[0] : batchId;
    const batch = await getBatchPayout(batchIdStr);
    res.json({ data: batch });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch batch payout", error: (error as Error).message });
  }
});

dashboardRouter.post("/batch-payouts/:batchId/process", async (req, res) => {
  try {
    const { batchId } = req.params;
    const batchIdStr = Array.isArray(batchId) ? batchId[0] : batchId;
    const actorId = (req as any).actor.userId;
    const result = await processBatchPayout(batchIdStr, actorId);
    res.json({ data: result });
  } catch (error) {
    res.status(500).json({ message: "Failed to process batch payout", error: (error as Error).message });
  }
});

dashboardRouter.post("/batch-payouts/:batchId/cancel", async (req, res) => {
  try {
    const { batchId } = req.params;
    const batchIdStr = Array.isArray(batchId) ? batchId[0] : batchId;
    const actorId = (req as any).actor.userId;
    const result = await cancelBatchPayout(batchIdStr, actorId);
    res.json({ data: result });
  } catch (error) {
    res.status(500).json({ message: "Failed to cancel batch payout", error: (error as Error).message });
  }
});

// Automation Rules Routes
dashboardRouter.post("/automation-rules", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  try {
    const input = {
      ...req.body,
      merchantId
    };
    const rule = await createAutomationRule(input);
    res.json({ data: rule });
  } catch (error) {
    res.status(500).json({ message: "Failed to create automation rule", error: (error as Error).message });
  }
});

dashboardRouter.get("/automation-rules", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  try {
    const rules = await listAutomationRules(merchantId);
    res.json({ data: rules });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch automation rules", error: (error as Error).message });
  }
});

dashboardRouter.get("/automation-rules/:ruleId", async (req, res) => {
  try {
    const { ruleId } = req.params;
    const ruleIdStr = Array.isArray(ruleId) ? ruleId[0] : ruleId;
    const rule = await getAutomationRule(ruleIdStr);
    if (!rule) {
      return res.status(404).json({ message: "Automation rule not found" });
    }
    res.json({ data: rule });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch automation rule", error: (error as Error).message });
  }
});

dashboardRouter.put("/automation-rules/:ruleId", async (req, res) => {
  try {
    const { ruleId } = req.params;
    const ruleIdStr = Array.isArray(ruleId) ? ruleId[0] : ruleId;
    const rule = await updateAutomationRule(ruleIdStr, req.body);
    res.json({ data: rule });
  } catch (error) {
    res.status(500).json({ message: "Failed to update automation rule", error: (error as Error).message });
  }
});

dashboardRouter.delete("/automation-rules/:ruleId", async (req, res) => {
  try {
    const { ruleId } = req.params;
    const ruleIdStr = Array.isArray(ruleId) ? ruleId[0] : ruleId;
    await deleteAutomationRule(ruleIdStr);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete automation rule", error: (error as Error).message });
  }
});

dashboardRouter.post("/automation-rules/evaluate", async (req, res) => {
  try {
    const { eventType, eventData } = req.body;
    await queues.automations.add(
      "execute",
      { eventType, eventData },
      {
        jobId: `automation:${eventType}:${Date.now()}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 20_000 },
        removeOnComplete: true,
        removeOnFail: false
      }
    );
    res.json({ data: { status: "queued", eventType } });
  } catch (error) {
    res.status(500).json({ message: "Failed to evaluate automation rules", error: (error as Error).message });
  }
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
  const { planCode } = req.body as { planCode: "free" | "premium" | "custom" };
  if (planCode === "custom") {
    res.status(403).json({
      error: "custom_requires_admin",
      message: "Custom pricing requires an admin override"
    });
    return;
  }
  const responsePayload = await updateMerchantSubscription(merchantId, planCode, {
    actorId: (req as any).actor.userId
  });
  res.locals.responsePayload = responsePayload;
  res.json(responsePayload);
});
