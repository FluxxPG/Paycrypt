import crypto from "node:crypto";

export class UPIClient {
  constructor(options) {
    this.options = options;
    this.baseUrl = options.baseUrl || "http://localhost:4000";
    this.fetcher = options.fetcher || fetch;
  }

  async createPayment(input, idempotencyKey) {
    return this.request("/v1/payments", {
      method: "POST",
      idempotencyKey,
      body: {
        ...input,
        method: "upi",
        provider: input.provider || "auto"
      }
    });
  }

  async fetchPayment(paymentId) {
    return this.request(`/v1/payments/${encodeURIComponent(paymentId)}`, {
      method: "GET"
    });
  }

  async getStatus(paymentId) {
    const payment = await this.fetchPayment(paymentId);
    return {
      paymentId,
      status: payment.status,
      provider: payment.upi_provider || payment.provider || null,
      transactionId: payment.transaction_id || payment.upi_transaction_id || null
    };
  }

  verifyWebhook(payload, signature, secret) {
    const body = typeof payload === "string" ? payload : JSON.stringify(payload);
    const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
    const received = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    return received.length === expectedBuffer.length && crypto.timingSafeEqual(received, expectedBuffer);
  }

  validatePaymentData(input) {
    const errors = [];
    if (!Number.isFinite(Number(input.amountFiat)) || Number(input.amountFiat) <= 0) {
      errors.push("amountFiat must be greater than 0");
    }
    if (!input.description || String(input.description).length < 3) {
      errors.push("description must be at least 3 characters");
    }
    if (!input.successUrl || !/^https?:\/\//i.test(input.successUrl)) {
      errors.push("successUrl must be an absolute URL");
    }
    if (!input.cancelUrl || !/^https?:\/\//i.test(input.cancelUrl)) {
      errors.push("cancelUrl must be an absolute URL");
    }
    if (input.provider && !["auto", "phonepe", "paytm", "razorpay", "freecharge"].includes(input.provider)) {
      errors.push("provider is not supported");
    }
    return {
      valid: errors.length === 0,
      errors
    };
  }

  getSupportedProviders() {
    return ["phonepe", "paytm", "razorpay", "freecharge"];
  }

  async request(path, init) {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.options.secretKey}`,
      ...(init.idempotencyKey ? { "Idempotency-Key": init.idempotencyKey } : {})
    };
    const response = await this.fetcher(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      method: init.method,
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.message || `Paycrypt UPI request failed with ${response.status}`);
    }
    return payload;
  }

  static getInfo() {
    return {
      name: "Paycrypt UPI SDK",
      version: "1.0.0",
      supportedProviders: ["phonepe", "paytm", "razorpay", "freecharge"]
    };
  }
}
