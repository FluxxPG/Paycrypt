import crypto from "node:crypto";
import { CryptoPayClient, CreatePaymentInput } from "@cryptopay/sdk";

export interface ShopifyPluginConfig {
  apiKey: string;
  apiSecret: string;
  shopDomain: string;
  shopifyAdminAccessToken: string;
  paycryptBaseUrl?: string;
  shopifyApiVersion?: string;
  fetcher?: typeof fetch;
}

export interface ShopifyOrder {
  id: number;
  name: string;
  total_price: string;
  currency: string;
  customer_email?: string;
  financial_status: string;
}

const statusMap: Record<string, string> = {
  created: "pending",
  pending: "pending",
  confirmed: "paid",
  failed: "voided",
  expired: "voided"
};

export class PaycryptShopifyPlugin {
  private client: CryptoPayClient;
  private shopDomain: string;
  private apiVersion: string;
  private accessToken: string;
  private paycryptBaseUrl: string;
  private fetcher: typeof fetch;

  constructor(config: ShopifyPluginConfig) {
    this.paycryptBaseUrl = config.paycryptBaseUrl || "https://api.paycrypt.com";
    this.client = new CryptoPayClient({
      secretKey: config.apiSecret,
      baseUrl: this.paycryptBaseUrl
    });
    this.shopDomain = config.shopDomain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    this.apiVersion = config.shopifyApiVersion || "2026-01";
    this.accessToken = config.shopifyAdminAccessToken;
    this.fetcher = config.fetcher ?? fetch;
  }

  async createPaymentFromOrder(
    order: ShopifyOrder,
    options: {
      successUrl?: string;
      cancelUrl?: string;
      description?: string;
      method?: "crypto" | "upi";
      provider?: "auto" | "phonepe" | "paytm" | "razorpay" | "freecharge";
    } = {}
  ) {
    const paymentInput: CreatePaymentInput & Record<string, unknown> = {
      amountFiat: Number.parseFloat(order.total_price),
      fiatCurrency: order.currency,
      settlementCurrency: "USDT",
      network: "TRC20",
      method: options.method ?? "crypto",
      provider: options.provider ?? "auto",
      description: options.description || `Shopify order ${order.name}`,
      customerEmail: order.customer_email,
      successUrl: options.successUrl || `https://${this.shopDomain}/account/orders/${order.id}`,
      cancelUrl: options.cancelUrl || `https://${this.shopDomain}/cart`,
      metadata: {
        platform: "shopify",
        shopifyOrderId: order.id,
        shopifyOrderName: order.name,
        shopDomain: this.shopDomain
      }
    };

    return this.client.payment.create(paymentInput);
  }

  async handleOrderCreated(order: ShopifyOrder) {
    if (order.financial_status !== "pending") {
      return { success: false, message: "Order is not pending payment" };
    }

    const payment = (await this.createPaymentFromOrder(order)) as any;
    await this.writeOrderMetafield(order.id, "paycrypt_payment_id", payment.paymentId ?? payment.id);
    await this.writeOrderMetafield(order.id, "paycrypt_checkout_url", payment.checkoutUrl ?? payment.checkout_url);

    return {
      success: true,
      paymentId: payment.paymentId ?? payment.id,
      checkoutUrl: payment.checkoutUrl ?? payment.checkout_url
    };
  }

  async syncPaymentStatus(paymentId: string, shopifyOrderId: number) {
    const payment = (await this.client.payment.fetch(paymentId)) as any;
    const shopifyFinancialStatus = statusMap[payment.status] || "pending";

    if (shopifyFinancialStatus === "paid") {
      await this.createTransaction(shopifyOrderId, {
        kind: "sale",
        status: "success",
        amount: String(payment.amountFiat ?? payment.amount_fiat),
        currency: payment.fiatCurrency ?? payment.fiat_currency,
        gateway: "Paycrypt",
        authorization: payment.txHash ?? payment.tx_hash ?? payment.id
      });
    }

    await this.writeOrderMetafield(shopifyOrderId, "paycrypt_status", payment.status);
    await this.writeOrderMetafield(shopifyOrderId, "paycrypt_payment_id", paymentId);

    return {
      paymentId,
      shopifyOrderId,
      paycryptStatus: payment.status,
      shopifyFinancialStatus,
      synced: true
    };
  }

  getPaymentLink(paymentId: string): string {
    return `${this.paycryptBaseUrl.replace(/\/$/, "")}/pay/${paymentId}`;
  }

  static validateWebhookSignature(payload: string, signature: string, webhookSecret: string): boolean {
    const digest = crypto.createHmac("sha256", webhookSecret).update(payload, "utf8").digest("base64");
    const left = Buffer.from(digest);
    const right = Buffer.from(signature);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }

  async getHealthStatus() {
    const [paycrypt, shopify] = await Promise.allSettled([
      this.fetcher(`${this.paycryptBaseUrl.replace(/\/$/, "")}/health`),
      this.shopifyRequest(`/shop.json`, { method: "GET" })
    ]);

    return {
      status:
        paycrypt.status === "fulfilled" &&
        paycrypt.value.ok &&
        shopify.status === "fulfilled"
          ? "healthy"
          : "unhealthy",
      shopDomain: this.shopDomain,
      paycryptReachable: paycrypt.status === "fulfilled" ? paycrypt.value.ok : false,
      shopifyReachable: shopify.status === "fulfilled",
      timestamp: new Date().toISOString()
    };
  }

  private async writeOrderMetafield(orderId: number, key: string, value: unknown) {
    return this.shopifyRequest(`/orders/${orderId}/metafields.json`, {
      method: "POST",
      body: JSON.stringify({
        metafield: {
          namespace: "paycrypt",
          key,
          type: "single_line_text_field",
          value: String(value ?? "")
        }
      })
    });
  }

  private async createTransaction(
    orderId: number,
    transaction: {
      kind: "sale" | "void" | "refund";
      status: "success" | "failure";
      amount: string;
      currency: string;
      gateway: string;
      authorization: string;
    }
  ) {
    return this.shopifyRequest(`/orders/${orderId}/transactions.json`, {
      method: "POST",
      body: JSON.stringify({ transaction })
    });
  }

  private async shopifyRequest<T = unknown>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetcher(
      `https://${this.shopDomain}/admin/api/${this.apiVersion}${path}`,
      {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": this.accessToken,
          ...(init.headers ?? {})
        }
      }
    );

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Shopify Admin API failed with ${response.status}: ${JSON.stringify(payload)}`);
    }
    return payload as T;
  }
}

export default PaycryptShopifyPlugin;
