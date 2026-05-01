import { Router } from "express";
import { upiConfigService, upiPaymentService } from "../lib/upi-services.js";
import { query } from "../lib/db.js";
import { decryptSecret } from "../lib/security.js";
import {
  requireJwt,
  requireAdmin
} from "../lib/middleware.js";
import {
  upiProviderConfigSchema,
  merchantUpiSettingsSchema,
  upiProviders
} from "@cryptopay/shared";

export const upiManagementRouter = Router();

// Merchant UPI Management Routes
upiManagementRouter.use(requireJwt);

// Get merchant UPI settings
upiManagementRouter.get("/settings", async (req, res) => {
  try {
    const merchantId = (req as any).actor.merchantId;
    const settings = await (upiPaymentService as any).getMerchantUpiSettings(merchantId);
    res.json(settings);
  } catch (error) {
    console.error("Get UPI settings error:", error);
    res.status(500).json({ error: "Failed to fetch UPI settings" });
  }
});

// Update merchant UPI settings
upiManagementRouter.put("/settings", async (req, res) => {
  try {
    const merchantId = (req as any).actor.merchantId;
    const current = await upiPaymentService.getMerchantUpiSettings(merchantId);
    if (!current?.upiEntitled) {
      return res.status(403).json({ error: "UPI is disabled by admin for this merchant" });
    }
    const validatedData = merchantUpiSettingsSchema.parse(req.body);
    const result = await upiConfigService.updateMerchantSettings(merchantId, validatedData);
    
    if (result.success) {
      res.json({ message: "UPI settings updated successfully" });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error("Update UPI settings error:", error);
    res.status(500).json({ error: "Failed to update UPI settings" });
  }
});

// Get merchant UPI providers
upiManagementRouter.get("/providers", async (req, res) => {
  try {
    const merchantId = (req as any).actor.merchantId;
    const providers = await upiConfigService.getMerchantProviders(merchantId);
    res.json({ providers });
  } catch (error) {
    console.error("Get UPI providers error:", error);
    res.status(500).json({ error: "Failed to fetch UPI providers" });
  }
});

// Add UPI provider
upiManagementRouter.post("/providers", async (req, res) => {
  try {
    const merchantId = (req as any).actor.merchantId;
    const current = await upiPaymentService.getMerchantUpiSettings(merchantId);
    if (!current?.upiEntitled) {
      return res.status(403).json({ error: "UPI is disabled by admin for this merchant" });
    }
    const validatedData = upiProviderConfigSchema.parse(req.body);
    const result = await upiConfigService.addProvider(merchantId, validatedData);
    
    if (result.success) {
      res.status(201).json({ message: "UPI provider added successfully" });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error("Add UPI provider error:", error);
    res.status(500).json({ error: "Failed to add UPI provider" });
  }
});

// Test UPI provider connection
upiManagementRouter.post("/providers/:providerName/test", async (req, res) => {
  try {
    const merchantId = (req as any).actor.merchantId;
    const current = await upiPaymentService.getMerchantUpiSettings(merchantId);
    if (!current?.upiEntitled) {
      return res.status(403).json({ error: "UPI is disabled by admin for this merchant" });
    }
    const { providerName } = req.params;
    let { apiKey, secretKey } = req.body as { apiKey?: string; secretKey?: string };
    if (!apiKey || !secretKey) {
      const existing = await query<{
        api_key_encrypted: string;
        secret_key_encrypted: string;
      }>(
        `select api_key_encrypted, secret_key_encrypted
         from upi_providers
         where merchant_id = $1 and provider_name = $2 and is_active = true
         limit 1`,
        [merchantId, providerName]
      );
      if (existing.rows[0]) {
        apiKey = decryptSecret(existing.rows[0].api_key_encrypted);
        secretKey = decryptSecret(existing.rows[0].secret_key_encrypted);
      }
    }

    if (!apiKey || !secretKey) {
      return res.status(400).json({ error: "Provider credentials are required for test" });
    }


    if (!upiProviders.includes(providerName as any)) {
      return res.status(400).json({ error: "Invalid provider name" });
    }

    const result = await upiConfigService.testProvider(
      merchantId,
      providerName as any,
      { apiKey, secretKey }
    );
    
    if (result.success) {
      res.json({ message: "Provider connection test successful" });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error("Test UPI provider error:", error);
    res.status(500).json({ error: "Failed to test UPI provider" });
  }
});

// Delete UPI provider
upiManagementRouter.delete("/providers/:providerName", async (req, res) => {
  try {
    const merchantId = (req as any).actor.merchantId;
    const { providerName } = req.params;

    if (!upiProviders.includes(providerName as any)) {
      return res.status(400).json({ error: "Invalid provider name" });
    }

    const result = await upiConfigService.deleteProvider(merchantId, providerName as any);
    
    if (result.success) {
      res.json({ message: "UPI provider deleted successfully" });
    } else {
      res.status(400).json({ error: result.error });
    }
  } catch (error) {
    console.error("Delete UPI provider error:", error);
    res.status(500).json({ error: "Failed to delete UPI provider" });
  }
});

// Manual UPI handle pool (multiple VPAs / QR payloads)
upiManagementRouter.get("/manual-accounts", async (req, res) => {
  try {
    const merchantId = (req as any).actor.merchantId;
    const result = await query(
      `select id, label, vpa, qr_payload, priority, is_active, last_used_at, usage_count, created_at, updated_at
       from upi_manual_accounts
       where merchant_id = $1
       order by priority asc, created_at asc`,
      [merchantId]
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error("Get manual accounts error:", error);
    res.status(500).json({ error: "Failed to fetch manual UPI accounts" });
  }
});

upiManagementRouter.post("/manual-accounts", async (req, res) => {
  try {
    const merchantId = (req as any).actor.merchantId;
    const current = await upiPaymentService.getMerchantUpiSettings(merchantId);
    if (!current?.upiEntitled) {
      return res.status(403).json({ error: "UPI is disabled by admin for this merchant" });
    }
    const { label, vpa, qrPayload, priority, isActive } = req.body as {
      label?: string;
      vpa: string;
      qrPayload?: string;
      priority?: number;
      isActive?: boolean;
    };
    const normalizedVpa = String(vpa ?? "").trim().toLowerCase();
    if (!normalizedVpa || !normalizedVpa.includes("@")) {
      return res.status(400).json({ error: "Valid VPA is required (example: merchant@upi)" });
    }
    await query(
      `insert into upi_manual_accounts (merchant_id, label, vpa, qr_payload, priority, is_active)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (merchant_id, vpa) do update set
         label = excluded.label,
         qr_payload = excluded.qr_payload,
         priority = excluded.priority,
         is_active = excluded.is_active,
         updated_at = now()`,
      [
        merchantId,
        label ?? null,
        normalizedVpa,
        qrPayload ?? null,
        Math.max(1, Number(priority ?? 1)),
        Boolean(isActive ?? true)
      ]
    );
    res.status(201).json({ success: true });
  } catch (error) {
    console.error("Add manual account error:", error);
    res.status(500).json({ error: "Failed to add manual UPI account" });
  }
});

upiManagementRouter.delete("/manual-accounts/:id", async (req, res) => {
  try {
    const merchantId = (req as any).actor.merchantId;
    const id = String(req.params.id);
    const result = await query(
      `delete from upi_manual_accounts where id = $1 and merchant_id = $2 returning id`,
      [id, merchantId]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: "Manual UPI account not found" });
    }
    res.json({ success: true });
  } catch (error) {
    console.error("Delete manual account error:", error);
    res.status(500).json({ error: "Failed to delete manual UPI account" });
  }
});

// Admin UPI Management Routes
export const upiAdminRouter = Router();
upiAdminRouter.use(requireJwt, requireAdmin());

// Get all merchants with UPI settings
upiAdminRouter.get("/merchants", async (req, res) => {
  try {
    const { query: queryLib } = await import("../lib/db.js");
    const result = await queryLib(`
      SELECT 
        m.id as merchant_id,
        m.name as merchant_name,
        mus.upi_enabled,
        mus.auto_routing_enabled,
        mus.fallback_to_manual,
        mus.allowed_providers,
        mus.provider_priority,
        COUNT(DISTINCT up.id) as provider_count,
        COUNT(DISTINCT p.id) as total_transactions,
        COALESCE(AVG(CASE WHEN p.status = 'confirmed' THEN 1 ELSE 0 END), 0) * 100 as success_rate,
        COALESCE(SUM(p.amount_fiat), 0) as total_volume,
        MAX(p.created_at) as last_activity,
        s.plan_code,
        s.upi_provider_limit
      FROM merchants m
      LEFT JOIN merchant_upi_settings mus ON m.id = mus.merchant_id
      LEFT JOIN upi_providers up ON m.id = up.merchant_id AND up.is_active = true
      LEFT JOIN payments p ON m.id = p.merchant_id AND p.payment_method = 'upi'
      LEFT JOIN subscriptions s ON m.id = s.merchant_id
      GROUP BY m.id, m.name, mus.upi_enabled, mus.auto_routing_enabled, mus.fallback_to_manual, 
               mus.allowed_providers, mus.provider_priority, s.plan_code, s.upi_provider_limit
      ORDER BY total_volume DESC
    `);

    const merchants = result.rows.map(row => ({
      merchantId: row.merchant_id,
      merchantName: row.merchant_name,
      upiEnabled: row.upi_enabled || false,
      activeProviders: row.provider_count || 0,
      totalTransactions: parseInt(row.total_transactions) || 0,
      successRate: parseFloat(row.success_rate) || 0,
      totalVolume: parseFloat(row.total_volume) || 0,
      lastActivity: row.last_activity || new Date().toISOString(),
      plan: row.plan_code || 'free',
      providerLimit: row.upi_provider_limit || 0
    }));

    res.json({ merchants });
  } catch (error) {
    console.error("Admin get merchants error:", error);
    res.status(500).json({ error: "Failed to fetch merchant UPI settings" });
  }
});

// Approve merchant UPI access
upiAdminRouter.post("/merchants/:merchantId/approve-upi", async (req, res) => {
  try {
    const { merchantId } = req.params;
    const { enabled, providerLimit } = req.body;
    
    const { query: queryLib } = await import("../lib/db.js");
    const resolvedLimit = enabled ? (providerLimit ?? 1) : 0;
    await queryLib(`
      UPDATE subscriptions 
      SET upi_enabled = $1, upi_provider_limit = $2
      WHERE merchant_id = $3
    `, [enabled, resolvedLimit, merchantId]);

    await queryLib(`
      UPDATE merchant_upi_settings 
      SET upi_enabled = $1
      WHERE merchant_id = $2
    `, [enabled, merchantId]);

    res.json({ message: "Merchant UPI access updated" });
  } catch (error) {
    console.error("Approve UPI access error:", error);
    res.status(500).json({ error: "Failed to approve UPI access" });
  }
});

// Upgrade merchant plan
upiAdminRouter.post("/merchants/:merchantId/upgrade-plan", async (req, res) => {
  try {
    const { merchantId } = req.params;
    const { plan } = req.body;
    
    const { query: queryLib } = await import("../lib/db.js");
    await queryLib(`
      UPDATE subscriptions 
      SET plan_code = $1
      WHERE merchant_id = $2
    `, [plan, merchantId]);

    // Update UPI features based on plan
    const upiEnabled = plan === 'custom';
    const providerLimit = plan === 'custom' ? -1 : 0;
    
    await queryLib(`
      UPDATE subscriptions 
      SET upi_enabled = $1, upi_provider_limit = $2
      WHERE merchant_id = $3
    `, [upiEnabled, providerLimit, merchantId]);

    res.json({ message: "Merchant plan upgraded" });
  } catch (error) {
    console.error("Upgrade plan error:", error);
    res.status(500).json({ error: "Failed to upgrade merchant plan" });
  }
});

// Get UPI provider statistics
upiAdminRouter.get("/statistics", async (req, res) => {
  try {
    const { query: queryLib } = await import("../lib/db.js");
    
    const [globalStats, providerStats, merchantStats] = await Promise.all([
      queryLib(`
        SELECT 
          COUNT(DISTINCT m.id) as total_merchants,
          COUNT(DISTINCT CASE WHEN mus.upi_enabled = true THEN m.id END) as upi_enabled_merchants,
          COUNT(DISTINCT up.id) as active_providers,
          COUNT(DISTINCT p.id) as total_upi_transactions,
          COALESCE(AVG(CASE WHEN p.status = 'confirmed' THEN 1 ELSE 0 END), 0) * 100 as overall_success_rate,
          COALESCE(SUM(p.amount_fiat), 0) as total_volume
        FROM merchants m
        LEFT JOIN merchant_upi_settings mus ON m.id = mus.merchant_id
        LEFT JOIN upi_providers up ON m.id = up.merchant_id AND up.is_active = true
        LEFT JOIN payments p ON m.id = p.merchant_id AND p.payment_method = 'upi'
      `),
      queryLib(`
        SELECT 
          provider_name,
          COUNT(DISTINCT merchant_id) as total_merchants,
          COUNT(DISTINCT CASE WHEN is_active = true THEN merchant_id END) as active_merchants,
          COUNT(DISTINCT CASE WHEN is_tested = true THEN merchant_id END) as tested_merchants,
          AVG(CASE WHEN test_status = 'success' THEN 1 ELSE 0 END) * 100 as success_rate
        FROM upi_providers
        GROUP BY provider_name
        ORDER BY active_merchants DESC
      `),
      queryLib(`
        SELECT 
          DATE_TRUNC('day', created_at) as day,
          COUNT(*) as transactions,
          COALESCE(SUM(amount_fiat), 0) as volume,
          COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed
        FROM payments
        WHERE payment_method = 'upi' AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY day DESC
      `)
    ]);

    res.json({
      ...(() => {
        const global = globalStats.rows[0] ?? {};
        const today = merchantStats.rows.find((row: any) => {
          const day = new Date(row.day);
          const now = new Date();
          return day.getUTCFullYear() === now.getUTCFullYear()
            && day.getUTCMonth() === now.getUTCMonth()
            && day.getUTCDate() === now.getUTCDate();
        });
        return {
          totalMerchants: parseInt(global.total_merchants) || 0,
          activeProviders: parseInt(global.active_providers) || 0,
          totalTransactions: parseInt(global.total_upi_transactions) || 0,
          successRate: parseFloat(global.overall_success_rate) || 0,
          totalVolume: parseFloat(global.total_volume) || 0,
          dailyTransactions: parseInt(today?.transactions ?? "0") || 0,
          dailyVolume: parseFloat(today?.volume ?? "0") || 0
        };
      })(),
      global: globalStats.rows[0],
      providers: providerStats.rows,
      dailyStats: merchantStats.rows
    });
  } catch (error) {
    console.error("Get UPI statistics error:", error);
    res.status(500).json({ error: "Failed to fetch UPI statistics" });
  }
});

// Get all UPI providers across all merchants
upiAdminRouter.get("/providers", async (req, res) => {
  try {
    const { query: queryLib } = await import("../lib/db.js");
    const result = await queryLib(`
      SELECT 
        up.provider_name,
        COUNT(DISTINCT up.merchant_id) as total_merchants,
        COUNT(DISTINCT CASE WHEN up.is_active = true THEN up.merchant_id END) as active_merchants,
        COUNT(DISTINCT CASE WHEN up.is_tested = true THEN up.merchant_id END) as tested_merchants,
        AVG(CASE WHEN up.test_status = 'success' THEN 1 ELSE 0 END) * 100 as success_rate,
        AVG(CASE WHEN up.last_tested_at IS NOT NULL THEN 1 ELSE 0 END) * 100 as tested_percentage,
        COUNT(CASE WHEN up.environment = 'production' THEN 1 END) as production_count,
        COUNT(CASE WHEN up.environment = 'test' THEN 1 END) as test_count
      FROM upi_providers up
      GROUP BY up.provider_name
      ORDER BY active_merchants DESC
    `);

    const providers = result.rows.map(row => ({
      providerName: row.provider_name,
      totalMerchants: parseInt(row.total_merchants) || 0,
      activeMerchants: parseInt(row.active_merchants) || 0,
      testedMerchants: parseInt(row.tested_merchants) || 0,
      successRate: parseFloat(row.success_rate) || 0,
      testedPercentage: parseFloat(row.tested_percentage) || 0,
      productionCount: parseInt(row.production_count) || 0,
      testCount: parseInt(row.test_count) || 0,
      status: row.active_merchants > 0 ? "healthy" : "inactive"
    }));

    res.json({ providers });
  } catch (error) {
    console.error("Get UPI providers error:", error);
    res.status(500).json({ error: "Failed to fetch UPI providers" });
  }
});
