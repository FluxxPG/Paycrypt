import crypto from "node:crypto";
import { CryptoPayClient, type CreatePaymentInput } from "@cryptopay/sdk";

export interface OpenCartPluginConfig {
  apiSecret: string;
  storeBaseUrl: string;
  paycryptBaseUrl?: string;
  openCartApiBaseUrl?: string;
  openCartApiToken?: string;
  webhookSecret?: string;
}

export interface OpenCartOrder {
  order_id: number;
  invoice_no?: string;
  total: string | number;
  currency_code: string;
  email?: string;
  firstname?: string;
  lastname?: string;
  order_status_id?: number;
}

const paycryptToOpenCartStatus: Record<string, number> = {
  created: 1,
  pending: 1,
  confirmed: 2,
  failed: 10,
  expired: 14
};

export class PaycryptOpenCartPlugin {
  private readonly client: CryptoPayClient;

  constructor(private readonly config: OpenCartPluginConfig) {
    this.client = new CryptoPayClient({
      secretKey: config.apiSecret,
      baseUrl: config.paycryptBaseUrl || "https://api.paycrypt.com"
    });
  }

  async createPaymentFromOrder(
    order: OpenCartOrder,
    options: {
      successUrl?: string;
      cancelUrl?: string;
      settlementCurrency?: CreatePaymentInput["settlementCurrency"];
      network?: CreatePaymentInput["network"];
      method?: "crypto" | "upi";
      provider?: "auto" | "phonepe" | "paytm" | "razorpay" | "freecharge";
    } = {}
  ) {
    const orderReference = order.invoice_no || String(order.order_id);
    return this.client.payment.create({
      amountFiat: Number(order.total),
      fiatCurrency: order.currency_code || "INR",
      settlementCurrency: options.settlementCurrency || "USDT",
      network: options.network || "TRC20",
      description: `OpenCart order ${orderReference}`,
      customerEmail: order.email,
      customerName: [order.firstname, order.lastname].filter(Boolean).join(" ") || undefined,
      successUrl: options.successUrl || `${this.config.storeBaseUrl}/index.php?route=checkout/success`,
      cancelUrl: options.cancelUrl || `${this.config.storeBaseUrl}/index.php?route=checkout/checkout`,
      metadata: {
        openCartOrderId: String(order.order_id),
        openCartInvoiceNo: order.invoice_no || "",
        integration: "opencart"
      },
      ...(options.method === "upi"
        ? {
            method: "upi" as never,
            provider: (options.provider || "auto") as never
          }
        : {})
    });
  }

  async syncPaymentStatus(paymentId: string, openCartOrderId: number) {
    const payment = await this.client.payment.fetch(paymentId);
    const statusId = paycryptToOpenCartStatus[payment.status] || paycryptToOpenCartStatus.pending;

    if (!this.config.openCartApiBaseUrl || !this.config.openCartApiToken) {
      return {
        paymentId,
        openCartOrderId,
        paycryptStatus: payment.status,
        openCartStatusId: statusId,
        synced: false,
        reason: "OpenCart API credentials are not configured"
      };
    }

    const response = await fetch(
      `${this.config.openCartApiBaseUrl.replace(/\/$/, "")}/orders/${encodeURIComponent(openCartOrderId)}/history`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.openCartApiToken}`
        },
        body: JSON.stringify({
          order_status_id: statusId,
          notify: payment.status === "confirmed",
          comment: `Paycrypt payment ${paymentId} is ${payment.status}`
        })
      }
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`OpenCart status sync failed with ${response.status}: ${body}`);
    }

    return {
      paymentId,
      openCartOrderId,
      paycryptStatus: payment.status,
      openCartStatusId: statusId,
      synced: true
    };
  }

  validatePaycryptWebhook(rawBody: string, signature: string) {
    if (!this.config.webhookSecret) {
      throw new Error("webhookSecret is required to validate Paycrypt webhooks");
    }
    const expected = crypto.createHmac("sha256", this.config.webhookSecret).update(rawBody).digest("hex");
    const received = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    return received.length === expectedBuffer.length && crypto.timingSafeEqual(received, expectedBuffer);
  }
}

export default PaycryptOpenCartPlugin;
