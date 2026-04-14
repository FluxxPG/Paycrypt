import { Router } from "express";
import { createPaymentIntent, fetchPayment, fetchPaymentLink } from "../lib/services.js";

export const publicRouter = Router();

publicRouter.get("/payments/:id", async (req, res) => {
  const payment = await fetchPayment(req.params.id);
  if (!payment) {
    return res.status(404).json({ message: "Payment not found" });
  }
  res.json(payment);
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
});
