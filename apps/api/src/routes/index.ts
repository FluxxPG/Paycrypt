import { Router } from "express";
import { authRouter } from "./auth.js";
import { dashboardRouter } from "./dashboard.js";
import { publicRouter } from "./public.js";
import { apiPlatformRouter } from "./platform.js";
import { adminRouter } from "./admin.js";
import { upiWebhooksRouter } from "./upi-webhooks.js";
import { upiManagementRouter, upiAdminRouter } from "./upi-management.js";
import { adminIntegrationsRouter, merchantIntegrationsRouter } from "./integrations.js";
import { employerRouter } from "./employer.js";

export const buildRouter = () => {
  const router = Router();
  router.use("/auth", authRouter);
  router.use("/dashboard", dashboardRouter);
  router.use("/v1", apiPlatformRouter);
  router.use("/public", publicRouter);
  router.use("/admin", adminRouter);
  router.use("/webhooks/upi", upiWebhooksRouter);
  router.use("/upi", upiManagementRouter);
  router.use("/admin/upi", upiAdminRouter);
  router.use("/dashboard/integrations", merchantIntegrationsRouter);
  router.use("/admin/integrations", adminIntegrationsRouter);
  router.use("/employer", employerRouter);
  return router;
};
