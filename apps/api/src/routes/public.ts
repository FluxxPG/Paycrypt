import { Router } from "express";
import { createPaymentIntent, fetchPayment, fetchPaymentLink } from "../lib/services.js";
import { upiPaymentService } from "../lib/upi-services.js";
import { query } from "../lib/db.js";

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
