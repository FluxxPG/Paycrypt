import { Router } from "express";
import { query } from "../lib/db.js";
import { queues } from "../lib/queue.js";
import { requireAdmin, requireJwt } from "../lib/middleware.js";
import { readTelemetrySnapshot } from "../lib/telemetry.js";
import { listMerchantsForAdmin, updateMerchantSubscription, updateMerchantWalletAccess } from "../lib/services.js";

export const adminRouter = Router();

adminRouter.use(requireJwt, requireAdmin());

adminRouter.get("/merchants", async (_req, res) => {
  res.json({ data: await listMerchantsForAdmin() });
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
