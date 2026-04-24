import { Router } from "express";
import { upiPaymentService } from "../lib/upi-services.js";
import { UPISecurityManager } from "../lib/upi-security.js";

export const upiWebhooksRouter = Router();

const handleUpiWebhook = async (
  provider: "phonepe" | "paytm" | "razorpay" | "freecharge",
  signatureHeader: string,
  req: any,
  res: any
) => {
  const clientIP = (req.ip || req.connection.remoteAddress || "127.0.0.1") as string;
  try {
    const rateLimitResult = await UPISecurityManager.checkWebhookRateLimit(clientIP);
    if (!rateLimitResult) {
      return res.status(429).json({ 
        error: "Rate limit exceeded",
        retryAfter: 60
      });
    }

    const signature = req.headers[signatureHeader] as string;
    if (!signature) {
      await UPISecurityManager.logSecurityEvent({
        type: "invalid_signature",
        ip: clientIP,
        details: { provider, reason: "Missing signature header" }
      });
      return res.status(400).json({ error: "Invalid signature" });
    }

    const sanitizedPayload = UPISecurityManager.sanitizeWebhookPayload(req.body);
    const headerEventId =
      (req.headers["x-razorpay-event-id"] as string | undefined) ||
      (req.headers["x-event-id"] as string | undefined) ||
      (req.headers["x-webhook-id"] as string | undefined) ||
      (req.headers["x-paytm-event-id"] as string | undefined) ||
      (req.headers["x-phonepe-event-id"] as string | undefined);
    const result = await upiPaymentService.handleWebhook(provider, sanitizedPayload, signature, {
      headerEventId,
      rawHeaders: req.headers
    });
    
    if (result.success) {
      res.status(200).json({ status: "success" });
    } else {
      await UPISecurityManager.logSecurityEvent({
        type: "webhook_failure",
        ip: clientIP,
        details: { provider, error: result.message }
      });
      res.status(400).json({ error: result.message });
    }
  } catch (error) {
    await UPISecurityManager.logSecurityEvent({
      type: "webhook_failure",
      ip: clientIP,
      details: { provider, error: error instanceof Error ? error.message : "Unknown error" }
    });
    console.error(`${provider} webhook error:`, error);
    res.status(500).json({ error: "Internal server error" });
  }
};

upiWebhooksRouter.post("/phonepe", (req, res) => handleUpiWebhook("phonepe", "x-verify", req, res));
upiWebhooksRouter.post("/paytm", (req, res) => handleUpiWebhook("paytm", "x-checksum", req, res));
upiWebhooksRouter.post("/razorpay", (req, res) => handleUpiWebhook("razorpay", "x-razorpay-signature", req, res));
upiWebhooksRouter.post("/freecharge", (req, res) => handleUpiWebhook("freecharge", "x-signature", req, res));
