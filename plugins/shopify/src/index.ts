import { CryptoPayClient, CreatePaymentInput } from "@cryptopay/sdk";

export interface ShopifyPluginConfig {
  apiKey: string;
  apiSecret: string;
  shopDomain: string;
  paycryptBaseUrl?: string;
}

export interface ShopifyOrder {
  id: number;
  name: string;
  total_price: string;
  currency: string;
  customer_email?: string;
  financial_status: string;
}

export class PaycryptShopifyPlugin {
  private client: CryptoPayClient;
  private shopDomain: string;

  constructor(config: ShopifyPluginConfig) {
    this.client = new CryptoPayClient({
      secretKey: config.apiSecret,
      baseUrl: config.paycryptBaseUrl || "https://api.paycrypt.com"
    });
    this.shopDomain = config.shopDomain;
  }

  /**
   * Create a payment intent from a Shopify order
   */
  async createPaymentFromOrder(order: ShopifyOrder, options: {
    successUrl?: string;
    cancelUrl?: string;
    description?: string;
  } = {}) {
    const paymentInput: CreatePaymentInput = {
      amountFiat: parseFloat(order.total_price),
      fiatCurrency: order.currency,
      settlementCurrency: "USDT",
      network: "TRC20",
      description: options.description || `Order ${order.name}`,
      customerEmail: order.customer_email,
      successUrl: options.successUrl || `https://${this.shopDomain}/account/orders/${order.id}`,
      cancelUrl: options.cancelUrl || `https://${this.shopDomain}/cart`,
      metadata: {
        shopifyOrderId: order.id,
        shopifyOrderName: order.name,
        shopDomain: this.shopDomain
      }
    };

    return this.client.payment.create(paymentInput);
  }

  /**
   * Handle Shopify webhook for order creation
   */
  async handleOrderCreated(order: ShopifyOrder) {
    // Auto-create payment if order is pending
    if (order.financial_status === "pending") {
      const payment = await this.createPaymentFromOrder(order);
      return {
        success: true,
        paymentId: payment.paymentId,
        checkoutUrl: payment.checkoutUrl
      };
    }

    return { success: false, message: "Order not in pending state" };
  }

  /**
   * Sync payment status back to Shopify
   */
  async syncPaymentStatus(paymentId: string, shopifyOrderId: number) {
    const payment = await this.client.payment.fetch(paymentId);

    // Map Paycrypt status to Shopify financial status
    const statusMap: Record<string, string> = {
      created: "pending",
      pending: "pending",
      confirmed: "paid",
      failed: "voided",
      expired: "voided"
    };

    const shopifyStatus = statusMap[payment.status] || "pending";

    // This would typically call Shopify Admin API
    // For now, return the mapped status
    return {
      paymentId,
      shopifyOrderId,
      paycryptStatus: payment.status,
      shopifyFinancialStatus: shopifyStatus
    };
  }

  /**
   * Get payment link for a Shopify order
   */
  getPaymentLink(paymentId: string): string {
    return `https://paycrypt.com/pay/${paymentId}`;
  }

  /**
   * Validate Shopify webhook signature
   */
  static validateWebhookSignature(payload: string, signature: string, webhookSecret: string): boolean {
    const crypto = require("crypto");
    const hmac = crypto.createHmac("sha256", webhookSecret);
    hmac.update(payload);
    const digest = hmac.digest("base64");
    return digest === signature;
  }

  /**
   * Process Shopify order refund via Paycrypt treasury
   */
  async processRefund(orderId: number, amount: number, reason: string) {
    // This would interact with the treasury system to process refunds
    // For now, return a placeholder response
    return {
      success: true,
      orderId,
      refundAmount: amount,
      reason,
      status: "processing"
    };
  }

  /**
   * Get plugin health status
   */
  async getHealthStatus() {
    try {
      // Test API connection
      await this.client.payment.fetch("test");
      return {
        status: "healthy",
        shopDomain: this.shopDomain,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: "unhealthy",
        shopDomain: this.shopDomain,
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

export default PaycryptShopifyPlugin;
