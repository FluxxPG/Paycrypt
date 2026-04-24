import { Router } from "express";
import { requireAdmin, requireJwt, requirePasswordSetupComplete, redisRateLimit } from "../lib/middleware.js";
import {
  connectMerchantIntegration,
  disconnectMerchantIntegration,
  listIntegrationsForAdmin,
  listMerchantIntegrations,
  syncMerchantIntegration,
  updateIntegrationStatusForAdmin
} from "../lib/integrations.js";

export const merchantIntegrationsRouter = Router();
merchantIntegrationsRouter.use(requireJwt, requirePasswordSetupComplete, redisRateLimit("dashboard_integrations", 180, 60));

merchantIntegrationsRouter.get("/", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  res.json({ data: await listMerchantIntegrations(merchantId) });
});

merchantIntegrationsRouter.post("/connect", async (req, res) => {
  try {
    const merchantId = (req as any).actor.merchantId;
    const responsePayload = await connectMerchantIntegration(merchantId, {
      platform: String(req.body.platform ?? ""),
      storeDomain: String(req.body.storeDomain ?? ""),
      storeName: req.body.storeName ? String(req.body.storeName) : undefined
    });
    res.locals.responsePayload = responsePayload;
    res.status(201).json(responsePayload);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Failed to connect integration" });
  }
});

merchantIntegrationsRouter.post("/:id/sync", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const result = await syncMerchantIntegration(merchantId, String(req.params.id));
  if (!result) return res.status(404).json({ message: "Integration not found" });
  res.json(result);
});

merchantIntegrationsRouter.delete("/:id", async (req, res) => {
  const merchantId = (req as any).actor.merchantId;
  const result = await disconnectMerchantIntegration(merchantId, String(req.params.id));
  if (!result) return res.status(404).json({ message: "Integration not found" });
  res.json(result);
});

export const adminIntegrationsRouter = Router();
adminIntegrationsRouter.use(requireJwt, requirePasswordSetupComplete, requireAdmin());

adminIntegrationsRouter.get("/", async (_req, res) => {
  res.json(await listIntegrationsForAdmin());
});

adminIntegrationsRouter.patch("/:id/status", async (req, res) => {
  const status = String(req.body.status ?? "") as "connected" | "suspended" | "error" | "disconnected";
  if (!["connected", "suspended", "error", "disconnected"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }
  const updated = await updateIntegrationStatusForAdmin(String(req.params.id), status);
  if (!updated) return res.status(404).json({ message: "Integration not found" });
  res.json(updated);
});

