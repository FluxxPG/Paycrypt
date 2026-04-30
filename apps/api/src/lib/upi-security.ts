import crypto from "node:crypto";
import { redis } from "./redis.js";
import { AppError } from "./errors.js";

export class UPISecurityManager {
  private static readonly RATE_LIMIT_WINDOW = 60; // seconds
  private static readonly RATE_LIMIT_MAX_REQUESTS = 100;
  private static readonly WEBHOOK_TIMEOUT = 30; // seconds

  // HMAC Signature Verification
  static verifyWebhookSignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  }

  // Generate HMAC signature for outgoing webhooks
  static generateWebhookSignature(payload: string, secret: string): string {
    return crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
  }

  // Rate limiting for UPI endpoints
  static async checkRateLimit(
    identifier: string,
    limit: number = this.RATE_LIMIT_MAX_REQUESTS,
    window: number = this.RATE_LIMIT_WINDOW
  ): Promise<{ allowed: boolean; remaining: number; resetTime?: number }> {
    const key = `upi_rate_limit:${identifier}`;
    const current = await redis.get(key);
    const now = Math.floor(Date.now() / 1000);

    if (!current) {
      // First request in window
      await redis.setex(key, window, JSON.stringify({
        count: 1,
        resetTime: now + window
      }));
      return { allowed: true, remaining: limit - 1 };
    }

    const data = JSON.parse(current);
    
    if (now >= data.resetTime) {
      // Window expired, reset
      await redis.setex(key, window, JSON.stringify({
        count: 1,
        resetTime: now + window
      }));
      return { allowed: true, remaining: limit - 1 };
    }

    if (data.count >= limit) {
      return { 
        allowed: false, 
        remaining: 0, 
        resetTime: data.resetTime 
      };
    }

    // Increment counter
    const newCount = data.count + 1;
    await redis.setex(key, window, JSON.stringify({
      count: newCount,
      resetTime: data.resetTime
    }));

    return { allowed: true, remaining: limit - newCount };
  }

  // IP-based rate limiting for webhook endpoints
  static async checkWebhookRateLimit(ip: string): Promise<boolean> {
    const key = `upi_webhook_rate:${ip}`;
    const count = await redis.incr(key);
    
    if (count === 1) {
      // Set expiry on first request
      await redis.expire(key, this.RATE_LIMIT_WINDOW);
    }

    return count <= 10; // Allow 10 webhook requests per minute per IP
  }

  // Validate UPI transaction ID format
  static validateTransactionId(transactionId: string): boolean {
    // UPI transaction IDs should be alphanumeric and 8-64 characters
    const regex = /^[a-zA-Z0-9]{8,64}$/;
    return regex.test(transactionId);
  }

  // Validate UPI ID format
  static validateUPIId(upiId: string): boolean {
    // Basic UPI ID validation (username@bank)
    const regex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/;
    return regex.test(upiId);
  }

  // Sanitize webhook payload
  static sanitizeWebhookPayload(payload: any): any {
    if (typeof payload !== "object" || payload === null) {
      throw new AppError(400, "invalid_webhook_payload", "Invalid webhook payload format");
    }

    // Remove potentially dangerous fields
    const sanitized = { ...payload };
    delete sanitized.eval;
    delete sanitized.function;
    delete sanitized.script;

    return sanitized;
  }

  // Validate provider credentials format
  static validateProviderCredentials(
    provider: string,
    apiKey: string,
    secretKey: string
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // API Key validation
    if (!apiKey || apiKey.length < 8) {
      errors.push("API key must be at least 8 characters");
    }

    if (!/^[a-zA-Z0-9_\-]+$/.test(apiKey)) {
      errors.push("API key contains invalid characters");
    }

    // Secret Key validation
    if (!secretKey || secretKey.length < 16) {
      errors.push("Secret key must be at least 16 characters");
    }

    // Provider-specific validation
    switch (provider) {
      case "phonepe":
        if (!apiKey.startsWith("PROD_") && !apiKey.startsWith("TEST_")) {
          errors.push("PhonePe API key must start with PROD_ or TEST_");
        }
        break;
      case "paytm":
        if (apiKey.length !== 20) {
          errors.push("Paytm merchant ID must be 20 characters");
        }
        break;
      case "razorpay":
        if (!apiKey.startsWith("rzp_")) {
          errors.push("Razorpay key must start with rzp_");
        }
        break;
      case "freecharge":
        if (apiKey.length < 10) {
          errors.push("Freecharge API key too short");
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Generate secure payment reference
  static generatePaymentReference(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(8).toString("hex");
    return `upi_${timestamp}_${random}`;
  }

  // Validate payment amount
  static validatePaymentAmount(amount: number, currency: string): boolean {
    if (currency !== "INR") {
      return false;
    }

    if (amount <= 0 || amount > 100000) {
      return false;
    }

    // Check if amount has more than 2 decimal places
    return !amount.toString().includes('.') || 
           amount.toString().split('.')[1]?.length <= 2;
  }

  // Encrypt sensitive data for storage
  static encryptSensitiveData(data: string, key: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key, 'utf8').slice(0, 32), iv);
    cipher.setAutoPadding(true);
    
    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");
    
    return iv.toString("hex") + ":" + encrypted;
  }

  // Decrypt sensitive data from storage
  static decryptSensitiveData(encryptedData: string, key: string): string {
    const parts = encryptedData.split(":");
    if (parts.length !== 2) {
      throw new Error("Invalid encrypted data format");
    }

    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key, 'utf8').slice(0, 32), iv);
    
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  }

  // Generate nonce for request replay protection
  static async generateNonce(): Promise<string> {
    const nonce = crypto.randomBytes(16).toString("hex");
    const key = `upi_nonce:${nonce}`;
    
    // Store nonce with 5 minute expiry
    await redis.setex(key, 300, "1");
    
    return nonce;
  }

  // Validate nonce to prevent replay attacks
  static async validateNonce(nonce: string): Promise<boolean> {
    const key = `upi_nonce:${nonce}`;
    const exists = await redis.exists(key);
    
    if (exists) {
      // Consume the nonce to prevent reuse
      await redis.del(key);
      return true;
    }
    
    return false;
  }

  // IP whitelist validation
  static async isIPWhitelisted(ip: string, merchantId: string): Promise<boolean> {
    const key = `upi_whitelist:${merchantId}`;
    const whitelist = await redis.get(key);
    
    if (!whitelist) {
      return true; // No whitelist configured, allow all
    }

    const allowedIPs = JSON.parse(whitelist);
    return allowedIPs.includes(ip);
  }

  // Detect suspicious patterns
  static detectSuspiciousActivity(request: {
    ip: string;
    userAgent: string;
    amount: number;
    frequency: number;
  }): { suspicious: boolean; reasons: string[] } {
    const reasons: string[] = [];
    let suspicionScore = 0;

    // Check for unusually high amounts
    if (request.amount > 50000) {
      reasons.push("Unusually high payment amount");
      suspicionScore += 2;
    }

    // Check for high frequency
    if (request.frequency > 10) {
      reasons.push("High request frequency");
      suspicionScore += 3;
    }

    // Check for suspicious user agents
    const suspiciousAgents = ["bot", "crawler", "scanner", "curl", "wget"];
    if (suspiciousAgents.some(agent => 
      request.userAgent.toLowerCase().includes(agent))) {
      reasons.push("Suspicious user agent");
      suspicionScore += 2;
    }

    // Check for known proxy/VPN indicators
    const proxyIndicators = ["proxy", "vpn", "tor", "anonymous"];
    if (proxyIndicators.some(indicator => 
      request.ip.toLowerCase().includes(indicator))) {
      reasons.push("Possible proxy/VPN usage");
      suspicionScore += 1;
    }

    return {
      suspicious: suspicionScore >= 3,
      reasons
    };
  }

  // Log security events
  static async logSecurityEvent(event: {
    type: "webhook_failure" | "rate_limit" | "invalid_signature" | "suspicious_activity";
    merchantId?: string;
    ip: string;
    details: any;
  }): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...event
    };

    // Store in Redis with 7-day expiry
    await redis.setex(
      `upi_security_log:${Date.now()}_${crypto.randomUUID()}`,
      604800,
      JSON.stringify(logEntry)
    );
  }
}
