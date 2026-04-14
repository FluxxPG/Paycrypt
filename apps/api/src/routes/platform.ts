import { Router } from "express";
import {
  createPaymentIntent,
  createPaymentLink,
  createWebhookEndpoint,
  fetchPayment,
  listBillingInvoices,
  getSubscriptionSummary,
  listSettlements,
  listTransactions
} from "../lib/services.js";
import {
  idempotencyGuard,
  redisRateLimit,
  requireApiKey,
  scopeGuard
} from "../lib/middleware.js";

export const apiPlatformRouter = Router();

apiPlatformRouter.use(
  requireApiKey,
  redisRateLimit("api_keys", (req) => req.apiKey?.rateLimitPerMinute ?? 120, 60),
  idempotencyGuard
);

apiPlatformRouter.post("/payments", scopeGuard("payments:write"), async (req, res) => {
  const merchantId = (req as any).apiKey.merchantId;
  const responsePayload = await createPaymentIntent(merchantId, req.body);
  res.locals.responsePayload = responsePayload;
  res.status(201).json(responsePayload);
});

apiPlatformRouter.get("/payments/:id", scopeGuard("payments:read"), async (req, res) => {
  const merchantId = (req as any).apiKey.merchantId;
  const payment = await fetchPayment(String(req.params.id), merchantId);
  if (!payment) {
    return res.status(404).json({ message: "Payment not found" });
  }
  res.json(payment);
});

apiPlatformRouter.post("/payment_links", scopeGuard("payment_links:write"), async (req, res) => {
  const merchantId = (req as any).apiKey.merchantId;
  const responsePayload = await createPaymentLink(merchantId, req.body);
  res.locals.responsePayload = responsePayload;
  res.status(201).json(responsePayload);
});

apiPlatformRouter.get("/transactions", scopeGuard("transactions:read"), async (req, res) => {
  const merchantId = (req as any).apiKey.merchantId;
  res.json({ data: await listTransactions(merchantId) });
});

apiPlatformRouter.get("/invoices", scopeGuard("billing:read"), async (req, res) => {
  const merchantId = (req as any).apiKey.merchantId;
  res.json({ data: await listBillingInvoices(merchantId) });
});

apiPlatformRouter.get("/settlements", scopeGuard("settlements:read"), async (req, res) => {
  const merchantId = (req as any).apiKey.merchantId;
  res.json({ data: await listSettlements(merchantId) });
});

apiPlatformRouter.post("/webhooks", scopeGuard("webhooks:write"), async (req, res) => {
  const merchantId = (req as any).apiKey.merchantId;
  const responsePayload = await createWebhookEndpoint(merchantId, req.body);
  res.locals.responsePayload = responsePayload;
  res.status(201).json(responsePayload);
});

apiPlatformRouter.get("/subscriptions", scopeGuard("subscriptions:read"), async (req, res) => {
  const merchantId = (req as any).apiKey.merchantId;
  res.json(await getSubscriptionSummary(merchantId));
});
