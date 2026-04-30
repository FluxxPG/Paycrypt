import crypto from "node:crypto";

// Enhanced Crypto SDK with production-ready features
export class CryptoPayClient {
  constructor(options) {
    this.options = options;
  }

  // Create payment with enhanced error handling
  async createPayment(input, idempotencyKey) {
    try {
      const response = await fetch(`${this.options.baseUrl}/v1/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.options.secretKey}`,
          ...(idempotencyKey && { "Idempotency-Key": idempotencyKey })
        },
        body: JSON.stringify({
          ...input,
          method: "crypto" // Explicitly set to crypto
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Payment creation failed");
      }

      return data;
    } catch (error) {
      throw new Error(`Payment creation failed: ${error.message}`);
    }
  }

  // Fetch payment with retry logic
  async fetchPayment(paymentId, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.options.baseUrl}/v1/payments/${paymentId}`, {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${this.options.secretKey}`
          }
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Payment fetch failed");
        }

        return data;
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) {
          throw new Error(`Payment fetch failed after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Exponential backoff
        await this.delay(Math.pow(2, attempt - 1) * 1000);
      }
    }

    return null; // This shouldn't be reached due to throw on last attempt
  }

  // Verify payment with enhanced validation
  async verifyPayment(paymentId) {
    try {
      const response = await fetch(`${this.options.baseUrl}/v1/payments/${paymentId}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.options.secretKey}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Payment verification failed");
      }

      return {
        success: true,
        payment: data
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        payment: null
      };
    }
  }

  // Enhanced webhook handling
  async verifyWebhookSignature(payload, signature, secret) {
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(payload))
      .digest("hex");

    const received = Buffer.from(signature, "hex");
    const expected = Buffer.from(expectedSignature, "hex");
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
  }

  // Utility methods
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Generate secure payment reference
  generatePaymentReference() {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(9).toString("base64url");
    return `crypto_${timestamp}_${random}`;
  }

  // Format currency amount
  formatAmount(amount, currency) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  // Error handling
  handleApiError(error, response) {
    if (error instanceof Error) {
      throw error;
    }
    
    throw new Error(response?.message || "API request failed");
  }
}
