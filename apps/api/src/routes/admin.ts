import { Router } from "express";
import { query } from "../lib/db.js";
import { queues } from "../lib/queue.js";
import { requireAdmin, requireJwt } from "../lib/middleware.js";
import { readTelemetrySnapshot } from "../lib/telemetry.js";
import {
  createMerchantForAdmin,
  disableMerchantForAdmin,
  getMerchantByIdForAdmin,
  listApiKeysForAdmin,
  listInvoicesForAdmin,
  listMerchantsForAdmin,
  listSubscriptionsForAdmin,
  listWebhookEndpointsForAdmin,
  listWalletsForAdmin,
  createApiKeysForAdmin,
  rotateApiKeyForAdmin,
  revokeApiKeyForAdmin,
  rotateWebhookEndpointForAdmin,
  revokeWebhookEndpointForAdmin,
  toggleWebhookEndpointForAdmin,
  updateMerchantForAdmin,
  updateMerchantSubscription,
  updateMerchantWalletAccess,
  updateWalletForAdmin
} from "../lib/services.js";

export const adminRouter = Router();

adminRouter.use(requireJwt, requireAdmin());

adminRouter.get("/merchants", async (_req, res) => {
  res.json({ data: await listMerchantsForAdmin() });
});

adminRouter.post("/merchants", requireAdmin(true), async (req, res) => {
  const { name, email, slug, ownerName, planCode } = req.body as {
    name: string;
    email: string;
    slug?: string;
    ownerName?: string;
    planCode?: "starter" | "business" | "premium" | "custom";
  };
  const responsePayload = await createMerchantForAdmin({
    name,
    email,
    slug,
    ownerName,
    planCode,
    actorId: (req as any).actor.userId
  });
  res.locals.responsePayload = responsePayload;
  res.json(responsePayload);
});

adminRouter.get("/merchants/:id", async (req, res) => {
  const merchant = await getMerchantByIdForAdmin(String(req.params.id));
  if (!merchant) {
    return res.status(404).json({ message: "Merchant not found" });
  }
  res.json({ data: merchant });
});

adminRouter.patch("/merchants/:id", requireAdmin(true), async (req, res) => {
  const { name, email, status, webhookBaseUrl, custodialEnabled } = req.body as {
    name?: string;
    email?: string;
    status?: string;
    webhookBaseUrl?: string | null;
    custodialEnabled?: boolean;
  };
  const responsePayload = await updateMerchantForAdmin(
    String(req.params.id),
    { name, email, status, webhookBaseUrl, custodialEnabled },
    (req as any).actor.userId
  );
  res.locals.responsePayload = responsePayload;
  res.json({ data: responsePayload });
});

adminRouter.delete("/merchants/:id", requireAdmin(true), async (req, res) => {
  const responsePayload = await disableMerchantForAdmin(String(req.params.id), (req as any).actor.userId);
  res.locals.responsePayload = responsePayload;
  res.json({ data: responsePayload });
});

adminRouter.get("/merchants/:id/wallets", async (req, res) => {
  res.json({ data: await listWalletsForAdmin(String(req.params.id)) });
});

adminRouter.get("/wallets", async (req, res) => {
  const merchantId = req.query.merchantId as string | undefined;
  if (!merchantId) {
    return res.status(400).json({ message: "merchantId is required" });
  }
  res.json({ data: await listWalletsForAdmin(merchantId) });
});

adminRouter.post("/merchants/:id/non-custodial", requireAdmin(true), async (req, res) => {
  await updateMerchantWalletAccess(String(req.params.id), Boolean(req.body.enabled), (req as any).actor.userId);
  res.json({ success: true });
});

adminRouter.post("/merchants/:id/subscription", requireAdmin(true), async (req, res) => {
  const { planCode, monthlyPriceInr, transactionLimit, setupFeeInr, status } = req.body as {
    planCode: "starter" | "business" | "premium" | "custom";
    monthlyPriceInr?: number;
    transactionLimit?: number;
    setupFeeInr?: number;
    status?: string;
  };
  const responsePayload = await updateMerchantSubscription(String(req.params.id), planCode, {
    monthlyPriceInr,
    transactionLimit,
    setupFeeInr,
    status,
    actorId: (req as any).actor.userId
  });
  res.locals.responsePayload = responsePayload;
  res.json(responsePayload);
});

adminRouter.patch("/wallets/:id", requireAdmin(true), async (req, res) => {
  const { isActive, isSelected } = req.body as { isActive?: boolean; isSelected?: boolean };
  const responsePayload = await updateWalletForAdmin(String(req.params.id), { isActive, isSelected }, (req as any).actor.userId);
  res.locals.responsePayload = responsePayload;
  res.json({ data: responsePayload });
});

adminRouter.get("/api-keys", async (req, res) => {
  const merchantId = req.query.merchantId as string | undefined;
  res.json({ data: await listApiKeysForAdmin(merchantId) });
});

adminRouter.post("/api-keys", requireAdmin(true), async (req, res) => {
  const { merchantId, name, scopes, rateLimitPerMinute } = req.body as {
    merchantId: string;
    name: string;
    scopes: string[];
    rateLimitPerMinute?: number;
  };
  const responsePayload = await createApiKeysForAdmin({
    merchantId,
    name,
    scopes,
    rateLimitPerMinute,
    actorId: (req as any).actor.userId
  });
  res.locals.responsePayload = responsePayload;
  res.status(201).json(responsePayload);
});

adminRouter.post("/api-keys/:id/rotate", requireAdmin(true), async (req, res) => {
  const { merchantId } = req.body as { merchantId: string };
  const responsePayload = await rotateApiKeyForAdmin(merchantId, req.params.id, (req as any).actor.userId);
  res.locals.responsePayload = responsePayload;
  res.json(responsePayload);
});

adminRouter.delete("/api-keys/:id", requireAdmin(true), async (req, res) => {
  const { merchantId } = req.body as { merchantId: string };
  await revokeApiKeyForAdmin(merchantId, req.params.id, (req as any).actor.userId);
  res.json({ success: true });
});

adminRouter.get("/webhooks", async (req, res) => {
  const merchantId = req.query.merchantId as string | undefined;
  res.json({ data: await listWebhookEndpointsForAdmin(merchantId) });
});

adminRouter.patch("/webhooks/:id", requireAdmin(true), async (req, res) => {
  const { merchantId, isActive } = req.body as { merchantId: string; isActive: boolean };
  const responsePayload = await toggleWebhookEndpointForAdmin(
    merchantId,
    req.params.id,
    Boolean(isActive),
    (req as any).actor.userId
  );
  res.locals.responsePayload = responsePayload;
  res.json(responsePayload);
});

adminRouter.post("/webhooks/:id/rotate", requireAdmin(true), async (req, res) => {
  const { merchantId } = req.body as { merchantId: string };
  const responsePayload = await rotateWebhookEndpointForAdmin(merchantId, req.params.id, (req as any).actor.userId);
  res.locals.responsePayload = responsePayload;
  res.json(responsePayload);
});

adminRouter.delete("/webhooks/:id", requireAdmin(true), async (req, res) => {
  const { merchantId } = req.body as { merchantId: string };
  await revokeWebhookEndpointForAdmin(merchantId, req.params.id, (req as any).actor.userId);
  res.json({ success: true });
});

adminRouter.get("/subscriptions", async (_req, res) => {
  res.json({ data: await listSubscriptionsForAdmin() });
});

adminRouter.get("/invoices", async (_req, res) => {
  res.json({ data: await listInvoicesForAdmin() });
});

adminRouter.get("/analytics", async (_req, res) => {
  const [
    merchants,
    payments,
    revenue,
    queueCounts,
    webhookSummary,
    settlementSummary,
    recentAuditLogs,
    recentWebhookLogs,
    telemetry
  ] = await Promise.all([
    query<{ total: number }>("select count(*)::int as total from merchants"),
    query<{ status: string; count: number; volume: string }>(
      `select status, count(*)::int as count, coalesce(sum(amount_fiat), 0)::numeric as volume
       from payments group by status`
    ),
    query<{ plan_code: string; merchants: number; mrr: string }>(
      `select plan_code, count(*)::int as merchants, sum(monthly_price_inr)::numeric as mrr
       from subscriptions where status = 'active'
       group by plan_code`
    ),
    Promise.all([
      queues.confirmations.getJobCounts("waiting", "active", "delayed", "failed", "completed"),
      queues.webhooks.getJobCounts("waiting", "active", "delayed", "failed", "completed"),
      queues.settlements.getJobCounts("waiting", "active", "delayed", "failed", "completed")
    ]),
    query<{ total: number; delivered: number; failed: number }>(
      `select
        count(*)::int as total,
        count(*) filter (where response_status between 200 and 299)::int as delivered,
        count(*) filter (where response_status is null or response_status not between 200 and 299)::int as failed
       from webhook_logs
       where created_at >= now() - interval '30 days'`
    ),
    query<{ total: number; processed: number; volume: string }>(
      `select
        count(*)::int as total,
        count(*) filter (where status = 'processed')::int as processed,
        coalesce(sum(amount_fiat), 0)::numeric as volume
       from settlements
       where created_at >= now() - interval '30 days'`
    ),
    query(
      `select actor_id, merchant_id, action, payload, created_at
       from audit_logs
       order by created_at desc
       limit 15`
    ),
    query(
      `select merchant_id, event_type, response_status, attempt, delivered_at, next_retry_at, created_at
       from webhook_logs
       order by created_at desc
       limit 15`
    ),
    readTelemetrySnapshot()
  ]);

  res.json({
    merchants: merchants.rows[0]?.total ?? 0,
    payments: payments.rows,
    revenue: revenue.rows,
    monitoring: {
      queues: {
        confirmations: queueCounts[0],
        webhooks: queueCounts[1],
        settlements: queueCounts[2]
      },
      webhookSummary: webhookSummary.rows[0] ?? { total: 0, delivered: 0, failed: 0 },
      settlementSummary: settlementSummary.rows[0] ?? { total: 0, processed: 0, volume: 0 },
      recentAuditLogs: recentAuditLogs.rows,
      recentWebhookLogs: recentWebhookLogs.rows,
      telemetry
    }
  });
});

adminRouter.get("/revenue", async (_req, res) => {
  const [subscriptions, invoices] = await Promise.all([listSubscriptionsForAdmin(), listInvoicesForAdmin()]);
  const activeSubscriptions = subscriptions.filter((sub) => sub.status === "active");
  const mrr = activeSubscriptions.reduce((sum, sub) => sum + Number(sub.monthly_price_inr ?? 0), 0);
  const invoiceTotals = invoices.reduce(
    (acc, invoice) => {
      const total = Number(invoice.total_inr ?? 0);
      const paid = Number(invoice.paid_amount_inr ?? 0);
      acc.total += total;
      acc.paid += paid;
      acc.outstanding += Math.max(0, total - paid);
      acc.overdue += invoice.status === "overdue" ? 1 : 0;
      return acc;
    },
    { total: 0, paid: 0, outstanding: 0, overdue: 0 }
  );
  res.json({
    mrr,
    activeSubscriptions: activeSubscriptions.length,
    invoiceTotals
  });
});

adminRouter.get("/risk", async (_req, res) => {
  const [queueCounts, webhookSummary, telemetry] = await Promise.all([
    Promise.all([
      queues.confirmations.getJobCounts("waiting", "active", "delayed", "failed", "completed"),
      queues.webhooks.getJobCounts("waiting", "active", "delayed", "failed", "completed"),
      queues.settlements.getJobCounts("waiting", "active", "delayed", "failed", "completed")
    ]),
    query<{ total: number; delivered: number; failed: number }>(
      `select
        count(*)::int as total,
        count(*) filter (where response_status between 200 and 299)::int as delivered,
        count(*) filter (where response_status is null or response_status not between 200 and 299)::int as failed
       from webhook_logs
       where created_at >= now() - interval '7 days'`
    ),
    readTelemetrySnapshot()
  ]);

  res.json({
    queues: {
      confirmations: queueCounts[0],
      webhooks: queueCounts[1],
      settlements: queueCounts[2]
    },
    webhookSummary: webhookSummary.rows[0] ?? { total: 0, delivered: 0, failed: 0 },
    telemetry
  });
});
