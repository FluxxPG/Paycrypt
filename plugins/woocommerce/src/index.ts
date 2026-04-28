import { CryptoPayClient, CreatePaymentInput } from "@cryptopay/sdk";

export interface WooCommercePluginConfig {
  apiKey: string;
  apiSecret: string;
  siteUrl: string;
  paycryptBaseUrl?: string;
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

export class PaycryptWooCommercePlugin {
  private client: CryptoPayClient;
  private siteUrl: string;

  constructor(config: WooCommercePluginConfig) {
    this.client = new CryptoPayClient({
      secretKey: config.apiSecret,
      baseUrl: config.paycryptBaseUrl || "https://api.paycrypt.com"
    });
    this.siteUrl = config.siteUrl;
  }

  /**
   * Create a payment intent from a WooCommerce order
   */
  async createPaymentFromOrder(order: WooCommerceOrder, options: {
    successUrl?: string;
    cancelUrl?: string;
    description?: string;
  } = {}) {
    const paymentInput: CreatePaymentInput = {
      amountFiat: parseFloat(order.total),
      fiatCurrency: order.currency,
      settlementCurrency: "USDT",
      network: "TRC20",
      description: options.description || `Order #${order.number}`,
      customerEmail: order.billing.email,
      customerName: `${order.billing.first_name} ${order.billing.last_name}`.trim(),
      successUrl: options.successUrl || `${this.siteUrl}/checkout/order-received/${order.id}`,
      cancelUrl: options.cancelUrl || `${this.siteUrl}/checkout`,
      metadata: {
        wooCommerceOrderId: order.id,
        wooCommerceOrderNumber: order.number,
        siteUrl: this.siteUrl
      }
    };

    return this.client.payment.create(paymentInput);
  }

  /**
   * Handle WooCommerce webhook for order creation
   */
  async handleOrderCreated(order: WooCommerceOrder) {
    // Auto-create payment if order is pending
    if (order.status === "pending") {
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
   * Sync payment status back to WooCommerce
   */
  async syncPaymentStatus(paymentId: string, wooCommerceOrderId: number) {
    const payment = await this.client.payment.fetch(paymentId);

    // Map Paycrypt status to WooCommerce order status
    const statusMap: Record<string, string> = {
      created: "pending",
      pending: "pending",
      confirmed: "processing",
      failed: "cancelled",
      expired: "cancelled"
    };

    const wooCommerceStatus = statusMap[payment.status] || "pending";

    // This would typically call WooCommerce REST API
    // For now, return the mapped status
    return {
      paymentId,
      wooCommerceOrderId,
      paycryptStatus: payment.status,
      wooCommerceOrderStatus: wooCommerceStatus
    };
  }

  /**
   * Get payment link for a WooCommerce order
   */
  getPaymentLink(paymentId: string): string {
    return `https://paycrypt.com/pay/${paymentId}`;
  }

  /**
   * Validate WooCommerce webhook signature
   */
  static validateWebhookSignature(payload: string, signature: string, webhookSecret: string): boolean {
    const crypto = require("crypto");
    const hmac = crypto.createHmac("sha256", webhookSecret);
    hmac.update(payload);
    const digest = hmac.digest("base64");
    return digest === signature;
  }

  /**
   * Process WooCommerce order refund via Paycrypt treasury
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
        siteUrl: this.siteUrl,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: "unhealthy",
        siteUrl: this.siteUrl,
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Create WooCommerce payment gateway settings
   */
  static getGatewaySettings() {
    return {
      enabled: true,
      title: "Paycrypt - Crypto & UPI Payments",
      description: "Accept crypto and UPI payments via Paycrypt",
      instructions: "Complete your payment using the secure checkout page.",
      icon: "https://paycrypt.com/assets/logo.png",
      supports: ["products", "refunds"],
      testMode: false,
      debugMode: false
    };
  }
}

export default PaycryptWooCommercePlugin;
