import type {
  UPIProvider,
  UPIProviderInterface,
  NormalizedUPIWebhook,
  ProviderRoutingConfig,
  MerchantUpiSettings,
  UPIProviderConfig,
  CreateUpiPaymentInput,
  PaymentMethod
} from "@cryptopay/shared";
import { createUPIProvider } from "./upi-providers.js";
import { query, withTransaction } from "./db.js";
import { decryptSecret, encryptSecret } from "./security.js";
import { emitPaymentEvent } from "./realtime.js";
import { AppError } from "./errors.js";
import { nanoid } from "nanoid";
import crypto from "crypto";

export class UPIPaymentService {
  private async getUpiEntitlement(merchantId: string): Promise<{ upiEnabled: boolean; providerLimit: number; planCode: string }> {
    const subscriptionResult = await query<{
      upi_enabled: boolean;
      upi_provider_limit: number;
      plan_code: string;
    }>(
      `select upi_enabled, upi_provider_limit, plan_code
       from subscriptions
       where merchant_id = $1
       order by created_at desc
       limit 1`,
      [merchantId]
    );
    const row = subscriptionResult.rows[0];
    return {
      upiEnabled: Boolean(row?.upi_enabled),
      providerLimit: Number(row?.upi_provider_limit ?? 0),
      planCode: row?.plan_code ?? "free"
    };
  }

  async createPaymentIntent(
    merchantId: string,
    paymentData: CreateUpiPaymentInput
  ): Promise<any> {
    // Get merchant UPI settings
    const merchantSettings = await this.getMerchantUpiSettings(merchantId);
    
    if (!merchantSettings.upiEnabled) {
      throw new AppError(403, "upi_disabled", "UPI payments are not enabled for this merchant");
    }

    // Get available providers for this merchant
    const providers = await this.getMerchantProviders(merchantId);
    
    if (providers.length === 0 && !merchantSettings.fallbackToManual) {
      throw new AppError(400, "no_upi_providers", "No UPI providers configured for this merchant");
    }

    // Select provider candidates based on routing strategy. Auto mode keeps a failover list.
    const providerCandidates = this.selectProviderCandidates(
      providers,
      paymentData.provider === "auto" ? undefined : paymentData.provider,
      merchantSettings
    );
    const selectedProvider = providerCandidates[0] ?? null;

    if (!selectedProvider && !merchantSettings.fallbackToManual) {
      throw new AppError(400, "provider_unavailable", "No suitable UPI provider available");
    }

    // Create payment record
    const paymentId = `upi_${nanoid()}`;
    
    const payment = await withTransaction(async (client) => {
      const result = await client.query(`
        INSERT INTO payments (
          id, merchant_id, amount_fiat, fiat_currency, payment_method,
          upi_provider, customer_email, customer_name, description,
          metadata, success_url, cancel_url, expires_at, status, upi_status, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, NOW()
        ) RETURNING *
      `, [
        paymentId,
        merchantId,
        paymentData.amountFiat,
        paymentData.fiatCurrency,
        "upi",
        selectedProvider?.providerName ?? "manual",
        paymentData.customerEmail,
        paymentData.customerName,
        paymentData.description,
        JSON.stringify(paymentData.metadata ?? {}),
        paymentData.successUrl,
        paymentData.cancelUrl,
        new Date(Date.now() + paymentData.expiresInMinutes * 60 * 1000),
        "created",
        "pending"
      ]);

      return result.rows[0];
    });

    const buildManualFallbackResponse = async () => {
      const manualAccount = await this.selectManualUpiAccount(merchantId);
      const merchantResult = await query<{
        upi_manual_mode_enabled: boolean;
        upi_manual_vpa: string | null;
        upi_manual_qr_url: string | null;
      }>(
        `select upi_manual_mode_enabled, upi_manual_vpa, upi_manual_qr_url
         from merchants where id = $1 limit 1`,
        [merchantId]
      );
      const merchant = merchantResult.rows[0];
      const vpa = manualAccount?.vpa ?? merchant?.upi_manual_vpa ?? null;
      const qrPayload = manualAccount?.qr_payload ?? merchant?.upi_manual_qr_url ?? null;
      if (!merchant?.upi_manual_mode_enabled || !vpa) {
        throw new AppError(400, "manual_upi_unavailable", "Manual UPI fallback is not configured for this merchant");
      }
      const manualIntent = `upi://pay?pa=${encodeURIComponent(vpa)}&pn=${encodeURIComponent("Paycrypt Merchant")}&am=${paymentData.amountFiat}&cu=${paymentData.fiatCurrency}&tn=${encodeURIComponent(paymentData.description)}`;
      await query(
        `update payments
         set upi_provider = 'manual',
             upi_vpa = $2,
             upi_intent_url = $3,
             upi_qr_code = $4,
             status = 'pending',
             upi_status = 'pending',
             updated_at = now()
         where id = $1`,
        [paymentId, vpa, manualIntent, qrPayload ?? manualIntent]
      );
      if (manualAccount) {
        await query(
          `update upi_manual_accounts
           set last_used_at = now(), usage_count = usage_count + 1, updated_at = now()
           where id = $1`,
          [manualAccount.id]
        );
      }
      return {
        paymentId,
        payment_id: paymentId,
        status: "pending",
        method: "upi",
        provider: "manual",
        vpa,
        checkoutUrl: `/pay/${paymentId}`,
        checkout_url: `/pay/${paymentId}`,
        intentUrl: manualIntent,
        intent_url: manualIntent,
        qrCode: qrPayload ?? manualIntent,
        qr_code: qrPayload ?? manualIntent,
        amount: paymentData.amountFiat,
        currency: paymentData.fiatCurrency,
        expiresAt: payment.expires_at
      };
    };

    if (!selectedProvider) {
      return buildManualFallbackResponse();
    }

    const providerErrors: Array<{ provider: string; error: string }> = [];
    for (const providerConfig of providerCandidates) {
      const provider = createUPIProvider(
        providerConfig.providerName,
        providerConfig.apiKey,
        providerConfig.secretKey,
        providerConfig.environment
      );

      const providerRequest = {
        paymentId,
        merchantId,
        amount: paymentData.amountFiat,
        customerEmail: paymentData.customerEmail,
        customerPhone: paymentData.customerPhone,
        customerName: paymentData.customerName,
        successUrl: paymentData.successUrl,
        webhookUrl: `${process.env.API_BASE_URL}/webhooks/upi/${providerConfig.providerName}`
      };

      const result = await provider.createPayment(providerRequest);
      if (!result.success) {
        providerErrors.push({
          provider: providerConfig.providerName,
          error: result.error || "Provider did not accept the payment request"
        });
        continue;
      }

      await query(`
        UPDATE payments 
        SET 
          upi_provider = $1,
          upi_transaction_id = $2,
          upi_intent_url = $3,
          upi_qr_code = $4,
          upi_status = 'pending',
          provider_response = $5,
          status = 'pending',
          updated_at = NOW()
        WHERE id = $6
      `, [
        providerConfig.providerName,
        result.paymentId,
        result.intentUrl ?? result.checkoutUrl,
        result.qrCode ?? result.intentUrl ?? result.checkoutUrl,
        JSON.stringify({ ...result, routedProvider: providerConfig.providerName, providerErrors }),
        paymentId
      ]);

      await query(
        `update upi_providers
         set last_used_at = now(), usage_count = usage_count + 1, updated_at = now()
         where merchant_id = $1 and provider_name = $2`,
        [merchantId, providerConfig.providerName]
      );

      // Emit real-time event
      await emitPaymentEvent({
        type: "payment.created",
        paymentId,
        merchantId,
        status: "pending"
      });

      return {
        paymentId,
        payment_id: paymentId,
        status: "pending",
        method: "upi",
        provider: providerConfig.providerName,
        checkoutUrl: `/pay/${paymentId}`,
        checkout_url: `/pay/${paymentId}`,
        providerCheckoutUrl: result.checkoutUrl,
        intentUrl: result.intentUrl ?? result.checkoutUrl,
        intent_url: result.intentUrl ?? result.checkoutUrl,
        qrCode: result.qrCode ?? result.intentUrl ?? result.checkoutUrl,
        qr_code: result.qrCode ?? result.intentUrl ?? result.checkoutUrl,
        amount: paymentData.amountFiat,
        currency: paymentData.fiatCurrency,
        expiresAt: payment.expires_at
      };
    }

    if (merchantSettings.fallbackToManual) {
      return buildManualFallbackResponse();
    }

    await query(`
      UPDATE payments 
      SET status = 'failed', provider_response = $2, updated_at = NOW() 
      WHERE id = $1
    `, [
      paymentId,
      JSON.stringify({ providerErrors })
    ]);

    throw new AppError(400, "payment_creation_failed", providerErrors[0]?.error || "Failed to create UPI payment");
  }

  async verifyPayment(paymentId: string, merchantId: string): Promise<any> {
    const payment = await query(`
      SELECT * FROM payments 
      WHERE id = $1 AND merchant_id = $2 AND payment_method = 'upi'
    `, [paymentId, merchantId]);

    if (payment.rows.length === 0) {
      throw new AppError(404, "payment_not_found", "UPI payment not found");
    }

    const paymentData = payment.rows[0];

    if (paymentData.status === "confirmed" || paymentData.status === "failed") {
      return {
        paymentId,
        status: paymentData.status,
        transactionId: paymentData.transaction_id,
        amount: paymentData.amount_fiat,
        currency: paymentData.fiat_currency
      };
    }

    // Get provider credentials
    const provider = await this.getProviderCredentials(
      merchantId,
      paymentData.upi_provider as UPIProvider
    );

    if (!provider) {
      throw new AppError(400, "provider_not_found", "UPI provider not found");
    }

    const upiProvider = createUPIProvider(
      paymentData.upi_provider as UPIProvider,
      provider.apiKey,
      provider.secretKey,
      provider.environment
    );

    const result = await upiProvider.verifyPayment(paymentData.upi_transaction_id);

    if (result.success) {
      const newStatus = result.status === "success" ? "confirmed" : 
                       result.status === "failed" ? "failed" : "pending";

      await query(`
        UPDATE payments 
        SET 
          status = $1,
          transaction_id = $2,
          updated_at = NOW()
        WHERE id = $3
      `, [newStatus, result.transactionId, paymentId]);

      // Emit real-time event
      await emitPaymentEvent({
        type: newStatus === "confirmed" ? "payment.confirmed" : 
              newStatus === "failed" ? "payment.failed" : "payment.pending",
        paymentId,
        merchantId,
        status: newStatus,
        txHash: result.transactionId
      });
    }

    return {
      paymentId,
      status: result.success ? (result.status === "success" ? "confirmed" : 
                                result.status === "failed" ? "failed" : "pending") : "unknown",
      transactionId: result.transactionId,
      amount: result.amount || paymentData.amount_fiat,
      currency: paymentData.fiat_currency,
      error: result.error
    };
  }

  async handleWebhook(
    providerName: UPIProvider,
    payload: any,
    signature: string,
    options?: { headerEventId?: string; rawHeaders?: Record<string, unknown> }
  ): Promise<{ success: boolean; message: string }> {
    try {
      const candidatePaymentId =
        payload?.paymentId ||
        payload?.payment_id ||
        payload?.merchantTransactionId ||
        payload?.merchant_transaction_id ||
        payload?.orderId ||
        payload?.order_id ||
        payload?.data?.merchantTransactionId ||
        payload?.data?.merchant_transaction_id ||
        payload?.data?.paymentId;

      let provider;
      if (candidatePaymentId) {
        const paymentLookup = await query<{ merchant_id: string }>(
          `select merchant_id
           from payments
           where id = $1 and payment_method = 'upi'
           limit 1`,
          [candidatePaymentId]
        );
        const merchantId = paymentLookup.rows[0]?.merchant_id;
        if (merchantId) {
          provider = await query(
            `select *
             from upi_providers
             where merchant_id = $1 and provider_name = $2 and is_active = true
             limit 1`,
            [merchantId, providerName]
          );
        }
      }

      if (!provider || provider.rows.length === 0) {
        provider = await query(
          `select *
           from upi_providers
           where provider_name = $1 and is_active = true
           order by updated_at desc
           limit 1`,
          [providerName]
        );
      }

      if (provider.rows.length === 0) {
        return { success: false, message: "Provider not found or inactive" };
      }

      // Initialize provider
      const upiProvider = createUPIProvider(
        providerName,
        decryptSecret(provider.rows[0].api_key_encrypted),
        decryptSecret(provider.rows[0].secret_key_encrypted),
        provider.rows[0].environment
      );

      // Validate and normalize webhook
      const webhookResult = await upiProvider.handleWebhook(payload, signature);

      if (!webhookResult.isValid) {
        return { success: false, message: webhookResult.error || "Invalid webhook" };
      }

      const normalized = webhookResult.normalizedPayload!;
      const eventId =
        options?.headerEventId ||
        payload?.eventId ||
        payload?.event_id ||
        payload?.id ||
        payload?.data?.eventId ||
        payload?.data?.event_id ||
        crypto.createHash("sha256").update(`${providerName}:${JSON.stringify(payload)}`).digest("hex");

      const logInsert = await query<{ id: string }>(
        `insert into upi_webhook_logs (
          merchant_id, provider_name, event_id, event_type, payload, normalized_payload, status, created_at
        ) values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, now())
        on conflict (merchant_id, provider_name, event_id) do nothing
        returning id`,
        [
          provider.rows[0].merchant_id,
          providerName,
          eventId,
          "upi.payment.status",
          JSON.stringify(payload),
          JSON.stringify(normalized),
          "processed"
        ]
      );
      if (!logInsert.rows[0]) {
        return { success: true, message: "Duplicate webhook ignored" };
      }
      
      // Find payment by UPI transaction ID
      const payment = await query(`
        SELECT * FROM payments 
        WHERE upi_transaction_id = $1 AND merchant_id = $2
      `, [normalized.upiTransactionId || normalized.transactionId, provider.rows[0].merchant_id]);

      if (payment.rows.length === 0) {
        return { success: false, message: "Payment not found" };
      }

      const paymentData = payment.rows[0];
      const newStatus = normalized.status === "success" ? "confirmed" : 
                       normalized.status === "failed" ? "failed" : "pending";
      const currentStatus = String(paymentData.status || "created");
      const statusRank: Record<string, number> = {
        created: 0,
        pending: 1,
        failed: 2,
        confirmed: 3
      };
      const currentRank = statusRank[currentStatus] ?? 0;
      const incomingRank = statusRank[newStatus] ?? 0;
      if (incomingRank < currentRank) {
        return { success: true, message: "Out-of-order webhook ignored" };
      }

      // Update payment status
      await query(`
        UPDATE payments 
        SET 
          status = $1,
          transaction_id = $2,
          upi_status = $3,
          updated_at = NOW()
        WHERE id = $4
      `, [newStatus, normalized.transactionId, normalized.status, paymentData.id]);

      // Emit real-time event
      await emitPaymentEvent({
        type: newStatus === "confirmed" ? "payment.confirmed" : 
              newStatus === "failed" ? "payment.failed" : "payment.pending",
        paymentId: paymentData.id,
        merchantId: provider.rows[0].merchant_id,
        status: newStatus,
        txHash: normalized.transactionId
      });

      // Send merchant webhook if configured
      await this.sendMerchantWebhook(provider.rows[0].merchant_id, {
        paymentId: paymentData.id,
        status: newStatus,
        amount: normalized.amount,
        method: "upi",
        provider: providerName,
        transactionId: normalized.transactionId,
        timestamp: normalized.timestamp
      });

      return { success: true, message: "Webhook processed successfully" };
    } catch (error) {
      console.error("Webhook processing error:", error);
      return { 
        success: false, 
        message: error instanceof Error ? error.message : "Webhook processing failed" 
      };
    }
  }

  async getMerchantUpiSettings(merchantId: string): Promise<any> {
    const [result, merchantResult, entitlement] = await Promise.all([
      query(`SELECT * FROM merchant_upi_settings WHERE merchant_id = $1`, [merchantId]),
      query(
        `select upi_manual_mode_enabled, upi_manual_vpa, upi_manual_qr_url
         from merchants where id = $1 limit 1`,
        [merchantId]
      ),
      this.getUpiEntitlement(merchantId)
    ]);
    const merchant = merchantResult.rows[0];

    if (result.rows.length === 0) {
      // Return default settings
      return {
        upiEnabled: false,
        autoRoutingEnabled: true,
        fallbackToManual: false,
        manualModeEnabled: Boolean(merchant?.upi_manual_mode_enabled),
        manualVpa: merchant?.upi_manual_vpa ?? undefined,
        manualQrUrl: merchant?.upi_manual_qr_url ?? undefined,
        rotationStrategy: "round_robin",
        refreshRerouteEnabled: true,
        maxReroutes: 3,
        allowedProviders: ["phonepe", "paytm", "razorpay", "freecharge"],
        providerPriority: {
          phonepe: 1,
          paytm: 2,
          razorpay: 3,
          freecharge: 4
        },
        upiEntitled: entitlement.upiEnabled,
        upiProviderLimit: entitlement.providerLimit,
        planCode: entitlement.planCode
      };
    }

    const row = result.rows[0];
    return {
      upiEnabled: Boolean(row.upi_enabled) && entitlement.upiEnabled,
      autoRoutingEnabled: row.auto_routing_enabled,
      fallbackToManual: row.fallback_to_manual,
      manualModeEnabled: Boolean(merchant?.upi_manual_mode_enabled),
      manualVpa: merchant?.upi_manual_vpa ?? undefined,
      manualQrUrl: merchant?.upi_manual_qr_url ?? undefined,
      rotationStrategy: row.rotation_strategy ?? "round_robin",
      refreshRerouteEnabled: row.refresh_reroute_enabled ?? true,
      maxReroutes: Number(row.max_reroutes ?? 3),
      allowedProviders: row.allowed_providers,
      providerPriority: typeof row.provider_priority === 'string' 
        ? JSON.parse(row.provider_priority) 
        : row.provider_priority,
      webhookSecret: row.webhook_secret_encrypted ? decryptSecret(row.webhook_secret_encrypted) : undefined,
      upiEntitled: entitlement.upiEnabled,
      upiProviderLimit: entitlement.providerLimit,
      planCode: entitlement.planCode
    };
  }

  private async getMerchantProviders(merchantId: string): Promise<any[]> {
    const result = await query(`
      SELECT 
        provider_name,
        api_key_encrypted,
        secret_key_encrypted,
        environment,
        priority,
        is_active,
        is_tested,
        last_used_at,
        usage_count
      FROM upi_providers 
      WHERE merchant_id = $1 AND is_active = true
      ORDER BY priority ASC
    `, [merchantId]);

    return result.rows.map(row => ({
      providerName: row.provider_name,
      apiKey: decryptSecret(row.api_key_encrypted),
      secretKey: decryptSecret(row.secret_key_encrypted),
      environment: row.environment,
      priority: row.priority,
      isActive: row.is_active,
      isTested: row.is_tested,
      lastUsedAt: row.last_used_at,
      usageCount: Number(row.usage_count ?? 0)
    }));
  }

  private async getProviderCredentials(
    merchantId: string,
    providerName: UPIProvider
  ): Promise<any> {
    const result = await query(`
      SELECT api_key_encrypted, secret_key_encrypted, environment
      FROM upi_providers 
      WHERE merchant_id = $1 AND provider_name = $2 AND is_active = true
    `, [merchantId, providerName]);

    if (result.rows.length === 0) {
      return null;
    }

    return {
      apiKey: decryptSecret(result.rows[0].api_key_encrypted),
      secretKey: decryptSecret(result.rows[0].secret_key_encrypted),
      environment: result.rows[0].environment
    };
  }

  private selectProviderCandidates(
    providers: any[],
    preferredProvider?: UPIProvider,
    settings?: MerchantUpiSettings
  ): any[] {
    const allowedProviders = new Set(settings?.allowedProviders ?? ["phonepe", "paytm", "razorpay", "freecharge"]);
    const testedProviders = providers
      .filter((p) => p.isTested && allowedProviders.has(p.providerName))
      .sort((a, b) => {
        const aPriority = settings?.providerPriority?.[a.providerName] ?? a.priority;
        const bPriority = settings?.providerPriority?.[b.providerName] ?? b.priority;
        if (aPriority !== bPriority) return aPriority - bPriority;
        const aLast = a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0;
        const bLast = b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0;
        return aLast - bLast;
      });

    if (preferredProvider && allowedProviders.has(preferredProvider)) {
      const preferred = providers.find(p => p.providerName === preferredProvider);
      if (preferred && preferred.isTested) {
        return [
          preferred,
          ...testedProviders.filter((provider) => provider.providerName !== preferred.providerName)
        ];
      }
    }

    return testedProviders;
  }

  private async selectManualUpiAccount(
    merchantId: string,
    input?: { excludeVpa?: string }
  ): Promise<{ id: string; vpa: string; qr_payload: string | null } | null> {
    const exclude = String(input?.excludeVpa ?? "").trim();
    const result = await query<{ id: string; vpa: string; qr_payload: string | null }>(
      `select id, vpa, qr_payload
       from upi_manual_accounts
       where merchant_id = $1
         and is_active = true
         and ($2 = '' or vpa <> $2)
       order by
         coalesce(last_used_at, 'epoch'::timestamptz) asc,
         priority asc,
         created_at asc
       limit 1`,
      [merchantId, exclude]
    );
    return result.rows[0] ?? null;
  }

  private async sendMerchantWebhook(merchantId: string, data: any): Promise<void> {
    // Get merchant webhook configuration
    const webhookResult = await query(`
      SELECT target_url, events, is_active FROM webhook_endpoints 
      WHERE merchant_id = $1 AND is_active = true
    `, [merchantId]);

    if (webhookResult.rows.length === 0) {
      return;
    }

    const webhook = webhookResult.rows[0];
    
    // Check if this event type is subscribed
    const eventType = data.status === "confirmed" ? "payment.confirmed" : 
                     data.status === "failed" ? "payment.failed" : "payment.pending";
    
    if (!webhook.events.includes(eventType)) {
      return;
    }

    try {
      await fetch(webhook.target_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Paycrypt-Webhook/1.0"
        },
        body: JSON.stringify({
          event: eventType,
          data,
          timestamp: new Date().toISOString()
        })
      });
    } catch (error) {
      console.error("Failed to send merchant webhook:", error);
    }
  }
}

export class UPIConfigService {
  async addProvider(
    merchantId: string,
    config: UPIProviderConfig
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const subscriptionResult = await query<{ upi_enabled: boolean; upi_provider_limit: number }>(
        `select upi_enabled, upi_provider_limit from subscriptions where merchant_id = $1 order by created_at desc limit 1`,
        [merchantId]
      );
      const subscription = subscriptionResult.rows[0];
      if (!subscription?.upi_enabled) {
        return { success: false, error: "UPI access is disabled by admin for this merchant" };
      }
      const activeProviderCount = await query<{ count: string }>(
        `select count(*)::text as count from upi_providers where merchant_id = $1 and is_active = true`,
        [merchantId]
      );
      const currentCount = Number(activeProviderCount.rows[0]?.count ?? "0");
      const providerLimit = Number(subscription.upi_provider_limit ?? 0);
      if (providerLimit >= 0 && currentCount >= providerLimit) {
        return { success: false, error: `Provider limit reached for this plan (${providerLimit})` };
      }

      // Encrypt credentials
      const encryptedApiKey = encryptSecret(config.apiKey);
      const encryptedSecretKey = encryptSecret(config.secretKey);

      await query(`
        INSERT INTO upi_providers (
          merchant_id, provider_name, api_key_encrypted, secret_key_encrypted,
          environment, priority, metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (merchant_id, provider_name) 
        DO UPDATE SET
          api_key_encrypted = EXCLUDED.api_key_encrypted,
          secret_key_encrypted = EXCLUDED.secret_key_encrypted,
          environment = EXCLUDED.environment,
          priority = EXCLUDED.priority,
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
      `, [
        merchantId,
        config.providerName,
        encryptedApiKey,
        encryptedSecretKey,
        config.environment,
        config.priority,
        JSON.stringify(config.metadata)
      ]);

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to add provider" 
      };
    }
  }

  async testProvider(
    merchantId: string,
    providerName: UPIProvider,
    credentials: { apiKey: string; secretKey: string }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const provider = createUPIProvider(providerName, credentials.apiKey, credentials.secretKey);
      const result = await provider.testConnection(credentials);

      if (result.success) {
        // Update provider test status
        await query(`
          UPDATE upi_providers 
          SET is_tested = true, last_tested_at = NOW(), test_status = 'success'
          WHERE merchant_id = $1 AND provider_name = $2
        `, [merchantId, providerName]);
      } else {
        await query(`
          UPDATE upi_providers 
          SET is_tested = false, test_status = 'failed'
          WHERE merchant_id = $1 AND provider_name = $2
        `, [merchantId, providerName]);
      }

      return result;
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Connection test failed" 
      };
    }
  }

  async updateMerchantSettings(
    merchantId: string,
    settings: MerchantUpiSettings
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const subscriptionResult = await query<{ upi_enabled: boolean }>(
        `select upi_enabled from subscriptions where merchant_id = $1 order by created_at desc limit 1`,
        [merchantId]
      );
      const upiEntitled = Boolean(subscriptionResult.rows[0]?.upi_enabled);
      if (settings.upiEnabled && !upiEntitled) {
        return { success: false, error: "UPI is locked for this merchant. Ask admin to enable it." };
      }

      const encryptedWebhookSecret = settings.webhookSecret 
        ? encryptSecret(settings.webhookSecret) 
        : null;

      await query(`
        INSERT INTO merchant_upi_settings (
          merchant_id, upi_enabled, auto_routing_enabled, fallback_to_manual,
          allowed_providers, provider_priority, webhook_secret_encrypted,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        ON CONFLICT (merchant_id) 
        DO UPDATE SET
          upi_enabled = EXCLUDED.upi_enabled,
          auto_routing_enabled = EXCLUDED.auto_routing_enabled,
          fallback_to_manual = EXCLUDED.fallback_to_manual,
          allowed_providers = EXCLUDED.allowed_providers,
          provider_priority = EXCLUDED.provider_priority,
          webhook_secret_encrypted = EXCLUDED.webhook_secret_encrypted,
          updated_at = NOW()
      `, [
        merchantId,
        settings.upiEnabled && upiEntitled,
        settings.autoRoutingEnabled,
        settings.fallbackToManual,
        settings.allowedProviders,
        JSON.stringify(settings.providerPriority),
        encryptedWebhookSecret
      ]);
      await query(
        `update merchants
         set upi_manual_mode_enabled = $2, upi_manual_vpa = $3, upi_manual_qr_url = $4, updated_at = now()
         where id = $1`,
        [merchantId, Boolean(settings.manualModeEnabled), settings.manualVpa ?? null, settings.manualQrUrl ?? null]
      );

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to update settings" 
      };
    }
  }

  async getMerchantProviders(merchantId: string): Promise<any[]> {
    const result = await query(`
      SELECT 
        id,
        provider_name,
        environment,
        is_active,
        is_tested,
        last_tested_at,
        test_status,
        priority,
        created_at,
        updated_at
      FROM upi_providers 
      WHERE merchant_id = $1
      ORDER BY priority ASC
    `, [merchantId]);

    return result.rows;
  }

  async deleteProvider(merchantId: string, providerName: UPIProvider): Promise<{ success: boolean; error?: string }> {
    try {
      await query(`
        DELETE FROM upi_providers 
        WHERE merchant_id = $1 AND provider_name = $2
      `, [merchantId, providerName]);

      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to delete provider" 
      };
    }
  }
}

export const upiPaymentService = new UPIPaymentService();
export const upiConfigService = new UPIConfigService();
