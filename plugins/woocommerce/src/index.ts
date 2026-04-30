import crypto from "node:crypto";
import { CryptoPayClient, CreatePaymentInput } from "@cryptopay/sdk";

export interface WooCommercePluginConfig {
  apiKey: string;
  apiSecret: string;
  siteUrl: string;
  consumerKey: string;
  consumerSecret: string;
  paycryptBaseUrl?: string;
  fetcher?: typeof fetch;
}

export interface WooCommerceOrder {
  id: number;
  number: string;
  total: string;
  currency: string;
  billing: {
    email?: string;
    first_name?: string;
    last_name?: string;
  };
  status: string;
}

const statusMap: Record<string, string> = {
  created: "pending",
  pending: "pending",
  confirmed: "processing",
  failed: "cancelled",
  expired: "cancelled"
};

export class PaycryptWooCommercePlugin {
  private client: CryptoPayClient;
  private siteUrl: string;
  private consumerKey: string;
  private consumerSecret: string;
  private paycryptBaseUrl: string;
  private fetcher: typeof fetch;

  constructor(config: WooCommercePluginConfig) {
    this.paycryptBaseUrl = config.paycryptBaseUrl || "https://api.paycrypt.com";
    this.client = new CryptoPayClient({
      secretKey: config.apiSecret,
      baseUrl: this.paycryptBaseUrl
    });
    this.siteUrl = config.siteUrl.replace(/\/$/, "");
    this.consumerKey = config.consumerKey;
    this.consumerSecret = config.consumerSecret;
    this.fetcher = config.fetcher ?? fetch;
  }

  async createPaymentFromOrder(
    order: WooCommerceOrder,
    options: {
      successUrl?: string;
      cancelUrl?: string;
      description?: string;
      method?: "crypto" | "upi";
      provider?: "auto" | "phonepe" | "paytm" | "razorpay" | "freecharge";
    } = {}
  ) {
    const paymentInput: CreatePaymentInput & Record<string, unknown> = {
      amountFiat: Number.parseFloat(order.total),
      fiatCurrency: order.currency,
      settlementCurrency: "USDT",
      network: "TRC20",
      method: options.method ?? "crypto",
      provider: options.provider ?? "auto",
      description: options.description || `WooCommerce order #${order.number}`,
      customerEmail: order.billing.email,
      customerName: `${order.billing.first_name ?? ""} ${order.billing.last_name ?? ""}`.trim(),
      successUrl: options.successUrl || `${this.siteUrl}/checkout/order-received/${order.id}`,
      cancelUrl: options.cancelUrl || `${this.siteUrl}/checkout`,
      metadata: {
        platform: "woocommerce",
        wooCommerceOrderId: order.id,
        wooCommerceOrderNumber: order.number,
        siteUrl: this.siteUrl
      }
    };

    return this.client.payment.create(paymentInput);
  }

  async handleOrderCreated(order: WooCommerceOrder) {
    if (order.status !== "pending") {
      return { success: false, message: "Order is not pending payment" };
    }

    const payment = (await this.createPaymentFromOrder(order)) as any;
    await this.updateOrder(order.id, {
      meta_data: [
        { key: "_paycrypt_payment_id", value: payment.paymentId ?? payment.id },
        { key: "_paycrypt_checkout_url", value: payment.checkoutUrl ?? payment.checkout_url }
      ]
    });

    return {
      success: true,
      paymentId: payment.paymentId ?? payment.id,
      checkoutUrl: payment.checkoutUrl ?? payment.checkout_url
    };
  }

  async syncPaymentStatus(paymentId: string, wooCommerceOrderId: number) {
    const payment = (await this.client.payment.fetch(paymentId)) as any;
    const wooCommerceStatus = statusMap[payment.status] || "pending";
    await this.updateOrder(wooCommerceOrderId, {
      status: wooCommerceStatus,
      transaction_id: payment.txHash ?? payment.tx_hash ?? payment.id,
      meta_data: [
        { key: "_paycrypt_payment_id", value: paymentId },
        { key: "_paycrypt_status", value: payment.status },
        { key: "_paycrypt_transaction_hash", value: payment.txHash ?? payment.tx_hash ?? "" }
      ]
    });

    return {
      paymentId,
      wooCommerceOrderId,
      paycryptStatus: payment.status,
      wooCommerceOrderStatus: wooCommerceStatus,
      synced: true
    };
  }

  async processRefund(orderId: number, amount: number, reason: string) {
    const refund = await this.wooRequest(`/orders/${orderId}/refunds`, {
      method: "POST",
      body: JSON.stringify({
        amount: amount.toFixed(2),
        reason,
        api_refund: false
      })
    });

    return {
      success: true,
      orderId,
      refund
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
    const [paycrypt, woo] = await Promise.allSettled([
      this.fetcher(`${this.paycryptBaseUrl.replace(/\/$/, "")}/health`),
      this.wooRequest("/system_status", { method: "GET" })
    ]);

    return {
      status:
        paycrypt.status === "fulfilled" &&
        paycrypt.value.ok &&
        woo.status === "fulfilled"
          ? "healthy"
          : "unhealthy",
      siteUrl: this.siteUrl,
      paycryptReachable: paycrypt.status === "fulfilled" ? paycrypt.value.ok : false,
      wooCommerceReachable: woo.status === "fulfilled",
      timestamp: new Date().toISOString()
    };
  }

  static getGatewaySettings() {
    return {
      enabled: true,
      title: "Paycrypt - Crypto & UPI Payments",
      description: "Accept crypto and UPI payments via Paycrypt hosted checkout",
      instructions: "Complete your payment using the secure Paycrypt checkout page.",
      supports: ["products", "refunds"],
      testMode: false,
      debugMode: false
    };
  }

  private updateOrder(orderId: number, payload: Record<string, unknown>) {
    return this.wooRequest(`/orders/${orderId}`, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
  }

  private async wooRequest<T = unknown>(path: string, init: RequestInit): Promise<T> {
    const url = new URL(`${this.siteUrl}/wp-json/wc/v3${path}`);
    url.searchParams.set("consumer_key", this.consumerKey);
    url.searchParams.set("consumer_secret", this.consumerSecret);

    const response = await this.fetcher(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`WooCommerce REST API failed with ${response.status}: ${JSON.stringify(payload)}`);
    }
    return payload as T;
  }
}

export default PaycryptWooCommercePlugin;
