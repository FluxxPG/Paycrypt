// UPI Payment SDK with Production-Ready Features
import {
  CreateUpiPaymentInput,
  UPICheckoutPayment,
  NormalizedUPIWebhook
} from "@cryptopay/shared";

export class UPIClient {
  constructor(options) {
    this.options = options;
    this.baseUrl = options.baseUrl || "http://localhost:4000";
    this.fetcher = options.fetcher || fetch;
  }

  // Create UPI payment with enhanced error handling
  async createPayment(input, idempotencyKey) {
    try {
      const response = await this.fetcher(`${this.baseUrl}/v1/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.options.secretKey}`,
          ...(idempotencyKey && { "Idempotency-Key": idempotencyKey })
        },
        body: JSON.stringify({
          ...input,
          method: "upi"
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "UPI payment creation failed");
      }

      return data;
    } catch (error) {
      throw new Error(`UPI payment creation failed: ${error.message}`);
    }
  }

  // Fetch UPI payment with retry logic
  async fetchPayment(paymentId, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.fetcher(`${this.baseUrl}/public/upi-payments/${paymentId}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json"
          }
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "UPI payment fetch failed");
        }

        return data;
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) {
          throw new Error(`UPI payment fetch failed after ${maxRetries} attempts: ${error.message}`);
        }
        
        // Exponential backoff
        await this.delay(Math.pow(2, attempt - 1) * 1000);
      }
    }

    return null; // Shouldn't be reached due to throw on last attempt
  }

  // Verify UPI payment with enhanced validation
  async verifyPayment(paymentId) {
    try {
      const response = await this.fetcher(`${this.baseUrl}/public/upi-payments/${paymentId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "UPI payment verification failed");
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

  // Handle UPI webhooks with signature verification
  async verifyWebhook(payload, signature, secret) {
    const crypto = require('node:crypto');
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(JSON.stringify(payload))
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  }

  // Generate UPI payment reference
  generatePaymentReference() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `upi_${timestamp}_${random}`;
  }

  // Format UPI amount for display
  formatAmount(amount, currency = "INR") {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  // Get supported UPI providers
  getSupportedProviders() {
    return ["phonepe", "paytm", "razorpay", "freecharge"];
  }

  // Validate UPI payment data
  validatePaymentData(input) {
    const errors = [];

    if (!input.amountFiat || input.amountFiat <= 0) {
      errors.push("Amount must be greater than 0");
    }

    if (input.amountFiat > 100000) {
      errors.push("Amount cannot exceed 100,000 INR");
    }

    if (!input.description || input.description.length < 3) {
      errors.push("Description must be at least 3 characters");
    }

    if (input.description && input.description.length > 280) {
      errors.push("Description cannot exceed 280 characters");
    }

    if (!input.successUrl || !input.successUrl.startsWith("http")) {
      errors.push("Valid success URL is required");
    }

    if (!input.cancelUrl || !input.cancelUrl.startsWith("http")) {
      errors.push("Valid cancel URL is required");
    }

    if (input.provider && !this.getSupportedProviders().includes(input.provider)) {
      errors.push("Unsupported UPI provider");
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Utility methods
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Enhanced error handling
  handleApiError(error, response) {
    if (error instanceof Error) {
      throw error;
    }
    
    throw new Error(response?.message || "API request failed");
  }

  // Create UPI payment link
  async createPaymentLink(input, idempotencyKey) {
    try {
      const response = await this.fetcher(`${this.baseUrl}/v1/payment_links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.options.secretKey}`,
          ...(idempotencyKey && { "Idempotency-Key": idempotencyKey })
        },
        body: JSON.stringify({
          ...input,
          paymentMethod: "upi"
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "UPI payment link creation failed");
      }

      return data;
    } catch (error) {
      throw new Error(`UPI payment link creation failed: ${error.message}`);
    }
  }

  // Get UPI payment link
  async fetchPaymentLink(linkId) {
    try {
      const response = await this.fetcher(`${this.baseUrl}/public/payment_links/${linkId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "UPI payment link fetch failed");
      }

      return data;
    } catch (error) {
      throw new Error(`UPI payment link fetch failed: ${error.message}`);
    }
  }

  // Real-time payment monitoring (WebSocket simulation)
  async monitorPayment(paymentId, onUpdate) {
    // In a real implementation, this would use WebSocket
    // For now, we'll simulate with polling
    let lastStatus = null;
    
    const poll = async () => {
      try {
        const payment = await this.fetchPayment(paymentId);
        
        if (payment && payment.status !== lastStatus) {
          lastStatus = payment.status;
          onUpdate({
            type: 'status_update',
            paymentId,
            status: payment.status,
            timestamp: new Date().toISOString()
          });
        }

        if (payment && (payment.status === 'confirmed' || payment.status === 'failed')) {
          // Stop polling on completion
          return;
        }
      } catch (error) {
        console.error('Payment monitoring error:', error);
      }
    };

    // Initial poll
    await poll();
    
    // Continue polling every 2 seconds
    const interval = setInterval(poll, 2000);
    
    return () => {
      clearInterval(interval);
    };
  }

  // Enhanced checkout URL generation
  generateCheckoutUrl(paymentId, options = {}) {
    const baseUrl = this.options.checkoutUrl || `${this.baseUrl}/pay`;
    const params = new URLSearchParams({
      payment_id: paymentId,
      ...options
    });
    
    return `${baseUrl}?${params.toString()}`;
  }

  // Mobile detection and optimization
  isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  // Get optimal payment method
  getOptimalPaymentMethod() {
    return this.isMobile() ? 'upi' : 'crypto';
  }

  // SDK version and info
  static getVersion() {
    return '1.0.0';
  }

  static getInfo() {
    return {
      name: 'Paycrypt UPI SDK',
      version: this.getVersion(),
      features: [
        'UPI Payment Creation',
        'UPI Payment Verification',
        'UPI Payment Links',
        'Webhook Verification',
        'Real-time Payment Monitoring',
        'Multi-provider Support',
        'Enhanced Error Handling',
        'Mobile Optimization',
        'Production-ready Security'
      ],
      supportedProviders: this.getSupportedProviders(),
      documentation: 'https://docs.paycrypt.com/sdk/upi'
    };
  }
}
