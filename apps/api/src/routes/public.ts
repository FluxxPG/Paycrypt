import { Router } from "express";
import { createPaymentIntent, fetchPayment, fetchPaymentLink } from "../lib/services.js";
import { upiPaymentService } from "../lib/upi-services.js";
import { query } from "../lib/db.js";
import { redisRateLimit } from "../lib/middleware.js";

export const publicRouter = Router();

publicRouter.get("/payments/:id", async (req, res) => {
  const payment = await fetchPayment(req.params.id);
  if (!payment) {
    return res.status(404).json({ message: "Payment not found" });
  }
  res.json(payment);
});

publicRouter.get("/payments/:id/dual", async (req, res) => {
  const sourcePayment = await fetchPayment(req.params.id);
  if (!sourcePayment) {
    return res.status(404).json({ message: "Payment not found" });
  }

  // If this is already a UPI payment, just return UPI only.
  if ((sourcePayment as any).payment_method === "upi") {
    return res.json({ crypto: null, upi: sourcePayment });
  }

  const merchantId = String((sourcePayment as any).merchant_id);
  const amountFiat = Number((sourcePayment as any).amount_fiat);
  const fiatCurrency = String((sourcePayment as any).fiat_currency ?? "INR");
  const description = String((sourcePayment as any).description ?? "Payment");
  const successUrl = String((sourcePayment as any).success_url ?? "");
  const cancelUrl = String((sourcePayment as any).cancel_url ?? "");

  // Reuse an existing linked UPI payment if one exists and has not expired.
  const existing = await query<{
    id: string;
    expires_at: string;
  }>(
    `select id, expires_at
     from payments
     where merchant_id = $1
       and payment_method = 'upi'
       and (metadata->>'sourcePaymentId') = $2
     order by created_at desc
     limit 1`,
    [merchantId, String(req.params.id)]
  );

  let upiPayment: any | null = null;
  const existingRow = existing.rows[0];
  if (existingRow && new Date(existingRow.expires_at).getTime() > Date.now()) {
    const result = await query(`select * from payments where id = $1 limit 1`, [existingRow.id]);
    upiPayment = result.rows[0] ?? null;
  }

  if (!upiPayment) {
    try {
      const created = await upiPaymentService.createPaymentIntent(merchantId, {
        amountFiat,
        fiatCurrency,
        method: "upi",
        provider: "auto",
        description,
        metadata: {
          sourcePaymentId: String(req.params.id)
        },
        successUrl,
        cancelUrl,
        expiresInMinutes: 30
      });
      const result = await query(`select * from payments where id = $1 limit 1`, [created.paymentId]);
      upiPayment = result.rows[0] ?? null;
    } catch {
      // If merchant does not have UPI enabled/configured, we still return crypto checkout.
      upiPayment = null;
    }
  }

  res.json({ crypto: sourcePayment, upi: upiPayment });
});

// UPI payment endpoint
publicRouter.get("/upi-payments/:id", async (req, res) => {
  try {
    const paymentResult = await query(
      `select * from payments where id = $1 and payment_method = 'upi' limit 1`,
      [req.params.id]
    );
    const payment = paymentResult.rows[0];
    if (!payment) {
      return res.status(404).json({ message: "UPI payment not found" });
    }
    res.json(payment);
  } catch (error) {
    console.error("Get UPI payment error:", error);
    res.status(500).json({ message: "Failed to fetch UPI payment" });
  }
});

// Reroute / rotate manual UPI handle for this checkout (public, rate-limited).
publicRouter.post(
  "/upi-payments/:id/reroute",
  redisRateLimit("public_upi_reroute", 12, 60),
  async (req, res) => {
    try {
      const paymentId = String(req.params.id);
      const paymentResult = await query<{
        id: string;
        merchant_id: string;
        amount_fiat: string;
        fiat_currency: string;
        description: string;
        status: string;
        expires_at: string;
        upi_provider: string | null;
        upi_vpa: string | null;
        upi_reroute_count: number | string | null;
      }>(
        `select id, merchant_id, amount_fiat, fiat_currency, description, status, expires_at, upi_provider, upi_vpa, upi_reroute_count
         from payments
         where id = $1 and payment_method = 'upi'
         limit 1`,
        [paymentId]
      );
      const payment = paymentResult.rows[0];
      if (!payment) {
        return res.status(404).json({ message: "UPI payment not found" });
      }

      if (new Date(payment.expires_at).getTime() <= Date.now()) {
        return res.status(409).json({ message: "Payment session expired" });
      }

      if (!["created", "pending"].includes(String(payment.status))) {
        return res.status(409).json({ message: "Payment can no longer be rerouted" });
      }

      const settings = await upiPaymentService.getMerchantUpiSettings(payment.merchant_id);
      if (!settings?.refreshRerouteEnabled) {
        return res.status(403).json({ message: "Reroute is disabled for this merchant" });
      }
      const currentCount = Number(payment.upi_reroute_count ?? 0);
      const maxReroutes = Number(settings.maxReroutes ?? 3);
      if (currentCount >= maxReroutes) {
        return res.status(429).json({ message: "Reroute limit reached for this checkout session" });
      }

      // Switch to the next manual VPA/QR (safe rotation without PSP re-init).
      const manual = await query<{ id: string; vpa: string; qr_payload: string | null }>(
        `select id, vpa, qr_payload
         from upi_manual_accounts
         where merchant_id = $1 and is_active = true and vpa <> coalesce($2, '')
         order by coalesce(last_used_at, 'epoch'::timestamptz) asc, priority asc, created_at asc
         limit 1`,
        [payment.merchant_id, payment.upi_vpa]
      );
      const next = manual.rows[0];
      if (!next) {
        return res.status(409).json({ message: "No alternative manual UPI handle available" });
      }

      const amount = Number(payment.amount_fiat ?? 0);
      const currency = String(payment.fiat_currency ?? "INR");
      const note = String(payment.description ?? "Paycrypt Checkout");
      const intent = `upi://pay?pa=${encodeURIComponent(next.vpa)}&pn=${encodeURIComponent(
        "Paycrypt Merchant"
      )}&am=${encodeURIComponent(amount.toFixed(2))}&cu=${encodeURIComponent(currency)}&tn=${encodeURIComponent(note)}`;

      await query(
        `update payments
         set upi_provider = 'manual',
             upi_transaction_id = null,
             upi_vpa = $2,
             upi_intent_url = $3,
             upi_qr_code = $4,
             upi_route_version = upi_route_version + 1,
             upi_reroute_count = upi_reroute_count + 1,
             updated_at = now()
         where id = $1`,
        [paymentId, next.vpa, intent, next.qr_payload ?? intent]
      );

      await query(
        `update upi_manual_accounts
         set last_used_at = now(), usage_count = usage_count + 1, updated_at = now()
         where id = $1`,
        [next.id]
      );

      const updated = await query(`select * from payments where id = $1 limit 1`, [paymentId]);
      return res.json(updated.rows[0]);
    } catch (error) {
      console.error("UPI reroute error:", error);
      res.status(500).json({ message: "Failed to reroute UPI checkout" });
    }
  }
);

publicRouter.get("/payment_links/:id", async (req, res) => {
  const paymentLink = await fetchPaymentLink(req.params.id);
  if (!paymentLink) {
    return res.status(404).json({ message: "Payment link not found" });
  }
  res.json(paymentLink);
});

publicRouter.post("/payment_links/:id/checkout", async (req, res) => {
  const paymentLink = await fetchPaymentLink(req.params.id);
  if (!paymentLink) {
    return res.status(404).json({ message: "Payment link not found" });
  }

  const { method = "crypto" } = req.body;

  if (method === "upi") {
    // Create UPI payment
    const responsePayload = await upiPaymentService.createPaymentIntent(paymentLink.merchant_id, {
      amountFiat: Number(paymentLink.amount_fiat),
      fiatCurrency: paymentLink.fiat_currency,
      method: "upi",
      provider: "auto",
      description: paymentLink.description,
      metadata: {},
      successUrl: paymentLink.success_url,
      cancelUrl: paymentLink.cancel_url,
      expiresInMinutes: 30
    });

    res.locals.responsePayload = responsePayload;
    res.status(201).json(responsePayload);
  } else {
    // Default crypto payment flow
    const responsePayload = await createPaymentIntent(paymentLink.merchant_id, {
      amountFiat: Number(paymentLink.amount_fiat),
      fiatCurrency: paymentLink.fiat_currency,
      settlementCurrency: paymentLink.settlement_currency,
      network: paymentLink.network,
      description: paymentLink.description,
      successUrl: paymentLink.success_url,
      cancelUrl: paymentLink.cancel_url
    });

    res.locals.responsePayload = responsePayload;
    res.status(201).json(responsePayload);
  }
});

// Unified checkout endpoint
publicRouter.post("/checkout", async (req, res) => {
  try {
    const { merchantId, method = "crypto", ...paymentData } = req.body;

    if (method === "upi") {
      const responsePayload = await upiPaymentService.createPaymentIntent(merchantId, {
        ...paymentData,
        method: "upi",
        provider: paymentData.provider || "auto",
        metadata: paymentData.metadata || {},
        expiresInMinutes: paymentData.expiresInMinutes || 30
      });

      res.locals.responsePayload = responsePayload;
      res.status(201).json(responsePayload);
    } else {
      const responsePayload = await createPaymentIntent(merchantId, paymentData);

      res.locals.responsePayload = responsePayload;
      res.status(201).json(responsePayload);
    }
  } catch (error) {
    console.error("Checkout error:", error);
    res.status(500).json({ message: "Checkout failed" });
  }
});
