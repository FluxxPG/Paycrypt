import crypto from "crypto";
import type {
  UPIProviderInterface,
  PhonePePaymentRequest,
  PhonePePaymentResponse,
  PaytmPaymentRequest,
  RazorpayPaymentRequest,
  RazorpayPaymentResponse,
  NormalizedUPIWebhook,
  UPIProvider
} from "@cryptopay/shared";
import { AppError } from "./errors.js";
import { withCircuitBreaker } from "./circuit-breaker.js";

const providerFetch = async (provider: string, input: RequestInfo | URL, init?: RequestInit) => {
  return withCircuitBreaker(
    `upi:${provider}`,
    async () => {
      return fetch(input, init);
    },
    {
      failureThreshold: 5,
      openDurationMs: 30_000
    }
  );
};

export class PhonePeProvider implements UPIProviderInterface {
  private apiKey: string;
  private secretKey: string;
  private environment: "test" | "production";
  private baseUrl: string;

  constructor(apiKey: string, secretKey: string, environment: "test" | "production" = "production") {
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.environment = environment;
    this.baseUrl = environment === "production" 
      ? "https://api.phonepe.com/v3" 
      : "https://api-preprod.phonepe.com/v3";
  }

  private generateSignature(payload: string): string {
    return crypto.createHash("sha256").update(payload + this.secretKey).digest("hex");
  }

  async createPayment(request: any): Promise<{
    success: boolean;
    paymentId?: string;
    checkoutUrl?: string;
    intentUrl?: string;
    qrCode?: string;
    error?: string;
  }> {
    try {
      const phonePeRequest: PhonePePaymentRequest = {
        merchantId: this.apiKey,
        merchantTransactionId: request.paymentId,
        amount: Math.round(request.amount * 100), // Convert to paise
        merchantUserId: request.merchantId,
        redirectUrl: request.successUrl,
        redirectMode: "REDIRECT",
        callbackUrl: request.webhookUrl,
        mobileNumber: request.customerPhone,
        email: request.customerEmail,
        shortName: request.customerName || "Customer"
      };

      const payload = JSON.stringify(phonePeRequest);
      const xVerify = this.generateSignature(payload) + "###" + crypto.randomUUID();

      const response = await providerFetch("phonepe", `${this.baseUrl}/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": xVerify,
          "X-CLIENT-ID": this.apiKey
        },
        body: payload
      });

      const data: PhonePePaymentResponse = await response.json();

      if (data.success && data.data?.transactionId) {
        const checkoutUrl = `${this.environment === "production" ? "https://mercury-t2.phonepe.com" : "https://mercury-uat.phonepe.com"}/transact?token=${data.data.transactionId}`;
        
        return {
          success: true,
          paymentId: data.data.transactionId,
          checkoutUrl,
          intentUrl: checkoutUrl
        };
      }

      return {
        success: false,
        error: data.message || "PhonePe payment creation failed"
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown PhonePe error"
      };
    }
  }

  async verifyPayment(paymentId: string): Promise<{
    success: boolean;
    status: "success" | "failed" | "pending";
    transactionId?: string;
    amount?: number;
    error?: string;
  }> {
    try {
      const xVerify = this.generateSignature(`/pg/v1/status/${this.apiKey}/${paymentId}` + this.secretKey);
      
      const response = await providerFetch(
        "phonepe",
        `${this.baseUrl}/pg/v1/status/${this.apiKey}/${paymentId}`,
        {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": xVerify,
          "X-CLIENT-ID": this.apiKey
        }
        }
      );

      const data = await response.json();

      if (data.success && data.data) {
        return {
          success: true,
          status: data.data.state === "COMPLETED" ? "success" : 
                  data.data.state === "FAILED" ? "failed" : "pending",
          transactionId: data.data.transactionId,
          amount: data.data.amount / 100 // Convert back to rupees
        };
      }

      return {
        success: false,
        status: "failed",
        error: data.message || "PhonePe verification failed"
      };
    } catch (error) {
      return {
        success: false,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown PhonePe verification error"
      };
    }
  }

  async handleWebhook(payload: any, signature: string): Promise<{
    isValid: boolean;
    normalizedPayload?: NormalizedUPIWebhook;
    error?: string;
  }> {
    try {
      const expectedSignature = this.generateSignature(JSON.stringify(payload));
      
      if (signature !== expectedSignature) {
        return {
          isValid: false,
          error: "Invalid webhook signature"
        };
      }

      const normalized: NormalizedUPIWebhook = {
        paymentId: payload.data?.merchantTransactionId || "",
        status: payload.data?.state === "COMPLETED" ? "success" : 
                payload.data?.state === "FAILED" ? "failed" : "pending",
        amount: (payload.data?.amount || 0) / 100,
        method: "upi",
        provider: "phonepe",
        transactionId: payload.data?.transactionId || "",
        upiTransactionId: payload.data?.paymentInstrument?.pgTransactionId,
        vpa: payload.data?.paymentInstrument?.upi?.vpa,
        timestamp: new Date().toISOString(),
        metadata: payload
      };

      return {
        isValid: true,
        normalizedPayload: normalized
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : "Webhook processing failed"
      };
    }
  }

  async testConnection(credentials: { apiKey: string; secretKey: string }): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const testPayload = JSON.stringify({ test: "connection" });
      const xVerify = crypto.createHash("sha256").update(testPayload + credentials.secretKey).digest("hex") + "###test";
      
      const response = await providerFetch("phonepe", `${this.baseUrl}/pay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-VERIFY": xVerify,
          "X-CLIENT-ID": credentials.apiKey
        },
        body: testPayload
      });

      // PhonePe doesn't have a dedicated health check, so we consider it successful if we get a response
      return {
        success: response.status < 500,
        error: response.status >= 500 ? "PhonePe server error" : undefined
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Connection test failed"
      };
    }
  }
}

export class PaytmProvider implements UPIProviderInterface {
  private apiKey: string;
  private secretKey: string;
  private environment: "test" | "production";
  private baseUrl: string;

  constructor(apiKey: string, secretKey: string, environment: "test" | "production" = "production") {
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.environment = environment;
    this.baseUrl = environment === "production" 
      ? "https://securegw.paytm.in" 
      : "https://securegw-stage.paytm.in";
  }

  private generateSignature(payload: string): string {
    return crypto.createHmac("sha256", this.secretKey).update(payload).digest("hex");
  }

  async createPayment(request: any): Promise<{
    success: boolean;
    paymentId?: string;
    checkoutUrl?: string;
    intentUrl?: string;
    qrCode?: string;
    error?: string;
  }> {
    try {
      const paytmRequest: PaytmPaymentRequest = {
        body: {
          requestType: "Payment",
          mid: this.apiKey,
          websiteName: "Paycrypt",
          orderId: request.paymentId,
          callbackUrl: request.webhookUrl,
          txnAmount: {
            value: request.amount.toString(),
            currency: "INR"
          },
          userInfo: {
            custId: request.merchantId,
            mobileNumber: request.customerPhone,
            email: request.customerEmail
          }
        },
        head: {
          tokenType: "TXN_TOKEN",
          version: "v1",
          channelCode: "WEB",
          requestTimestamp: Date.now().toString(),
          signature: ""
        }
      };

      const bodyPayload = JSON.stringify(paytmRequest.body);
      paytmRequest.head.signature = this.generateSignature(bodyPayload);

      const response = await providerFetch(
        "paytm",
        `${this.baseUrl}/theia/api/v1/initiateTransaction?mid=${this.apiKey}&orderId=${request.paymentId}`,
        {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(paytmRequest)
        }
      );

      const data = await response.json();

      if (data.body?.resultInfo?.resultStatus === "SUCCESS") {
        const checkoutUrl = `${this.baseUrl}/theia/api/v1/showPaymentPage?mid=${this.apiKey}&orderId=${request.paymentId}`;
        
        return {
          success: true,
          paymentId: request.paymentId,
          checkoutUrl
        };
      }

      return {
        success: false,
        error: data.body?.resultInfo?.resultMsg || "Paytm payment creation failed"
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown Paytm error"
      };
    }
  }

  async verifyPayment(paymentId: string): Promise<{
    success: boolean;
    status: "success" | "failed" | "pending";
    transactionId?: string;
    amount?: number;
    error?: string;
  }> {
    try {
      const response = await providerFetch(
        "paytm",
        `${this.baseUrl}/merchant-status/api/v1/getPaymentStatus?mid=${this.apiKey}&orderId=${paymentId}`,
        {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
        }
      );

      const data = await response.json();

      if (data.body?.resultInfo?.resultStatus) {
        return {
          success: true,
          status: data.body.resultInfo.resultStatus === "TXN_SUCCESS" ? "success" : 
                  data.body.resultInfo.resultStatus === "TXN_FAILURE" ? "failed" : "pending",
          transactionId: data.body.txnId,
          amount: parseFloat(data.body.txnAmount || "0")
        };
      }

      return {
        success: false,
        status: "failed",
        error: data.body?.resultInfo?.resultMsg || "Paytm verification failed"
      };
    } catch (error) {
      return {
        success: false,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown Paytm verification error"
      };
    }
  }

  async handleWebhook(payload: any, signature: string): Promise<{
    isValid: boolean;
    normalizedPayload?: NormalizedUPIWebhook;
    error?: string;
  }> {
    try {
      // Paytm webhook validation
      const expectedSignature = this.generateSignature(JSON.stringify(payload));
      
      if (signature !== expectedSignature) {
        return {
          isValid: false,
          error: "Invalid webhook signature"
        };
      }

      const normalized: NormalizedUPIWebhook = {
        paymentId: payload.body?.orderId || "",
        status: payload.body?.resultInfo?.resultStatus === "TXN_SUCCESS" ? "success" : 
                payload.body?.resultInfo?.resultStatus === "TXN_FAILURE" ? "failed" : "pending",
        amount: parseFloat(payload.body?.txnAmount || "0"),
        method: "upi",
        provider: "paytm",
        transactionId: payload.body?.txnId || "",
        timestamp: new Date().toISOString(),
        metadata: payload
      };

      return {
        isValid: true,
        normalizedPayload: normalized
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : "Webhook processing failed"
      };
    }
  }

  async testConnection(credentials: { apiKey: string; secretKey: string }): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const response = await providerFetch(
        "paytm",
        `${credentials.apiKey.includes("test") ? "https://securegw-stage.paytm.in" : "https://securegw.paytm.in"}/merchant-status/api/v1/getPaymentStatus?mid=${credentials.apiKey}&orderId=test`,
        {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        }
        }
      );

      return {
        success: response.status < 500,
        error: response.status >= 500 ? "Paytm server error" : undefined
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Connection test failed"
      };
    }
  }
}

export class RazorpayProvider implements UPIProviderInterface {
  private apiKey: string;
  private secretKey: string;
  private environment: "test" | "production";
  private baseUrl: string;

  constructor(apiKey: string, secretKey: string, environment: "test" | "production" = "production") {
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.environment = environment;
    this.baseUrl = environment === "production" 
      ? "https://api.razorpay.com/v1" 
      : "https://api.razorpay.com/v1";
  }

  private getAuthHeader(): string {
    return "Basic " + Buffer.from(`${this.apiKey}:${this.secretKey}`).toString("base64");
  }

  async createPayment(request: any): Promise<{
    success: boolean;
    paymentId?: string;
    checkoutUrl?: string;
    intentUrl?: string;
    qrCode?: string;
    error?: string;
  }> {
    try {
      const razorpayRequest: RazorpayPaymentRequest = {
        amount: Math.round(request.amount * 100), // Convert to paise
        currency: "INR",
        receipt: request.paymentId,
        notes: {
          merchant_id: request.merchantId,
          customer_email: request.customerEmail,
          customer_phone: request.customerPhone
        },
        callback_url: request.webhookUrl,
        redirect: true,
        email: request.customerEmail,
        contact: request.customerPhone
      };

      const response = await providerFetch("razorpay", `${this.baseUrl}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": this.getAuthHeader()
        },
        body: JSON.stringify(razorpayRequest)
      });

      const data = await response.json();

      if (data.id) {
        const checkoutUrl = `https://rzp.io/i/${data.id}`;
        
        return {
          success: true,
          paymentId: data.id,
          checkoutUrl,
          intentUrl: `upi://pay?pa=razorpay&pn=Razorpay&am=${data.amount}&cu=INR&tn=${data.id}`
        };
      }

      return {
        success: false,
        error: data.error?.description || "Razorpay payment creation failed"
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown Razorpay error"
      };
    }
  }

  async verifyPayment(paymentId: string): Promise<{
    success: boolean;
    status: "success" | "failed" | "pending";
    transactionId?: string;
    amount?: number;
    error?: string;
  }> {
    try {
      const response = await providerFetch("razorpay", `${this.baseUrl}/orders/${paymentId}/payments`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": this.getAuthHeader()
        }
      });

      const data = await response.json();

      if (data.items && data.items.length > 0) {
        const payment = data.items[0];
        return {
          success: true,
          status: payment.status === "captured" ? "success" : 
                  payment.status === "failed" ? "failed" : "pending",
          transactionId: payment.id,
          amount: payment.amount / 100
        };
      }

      return {
        success: false,
        status: "failed",
        error: "No payments found for this order"
      };
    } catch (error) {
      return {
        success: false,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown Razorpay verification error"
      };
    }
  }

  async handleWebhook(payload: any, signature: string): Promise<{
    isValid: boolean;
    normalizedPayload?: NormalizedUPIWebhook;
    error?: string;
  }> {
    try {
      const expectedSignature = crypto.createHmac("sha256", this.secretKey)
        .update(JSON.stringify(payload))
        .digest("hex");

      if (signature !== expectedSignature) {
        return {
          isValid: false,
          error: "Invalid webhook signature"
        };
      }

      const normalized: NormalizedUPIWebhook = {
        paymentId: payload.payload?.payment?.entity?.order_id || "",
        status: payload.payload?.payment?.entity?.status === "captured" ? "success" : 
                payload.payload?.payment?.entity?.status === "failed" ? "failed" : "pending",
        amount: (payload.payload?.payment?.entity?.amount || 0) / 100,
        method: "upi",
        provider: "razorpay",
        transactionId: payload.payload?.payment?.entity?.id || "",
        vpa: payload.payload?.payment?.entity?.vpa,
        timestamp: new Date().toISOString(),
        metadata: payload
      };

      return {
        isValid: true,
        normalizedPayload: normalized
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : "Webhook processing failed"
      };
    }
  }

  async testConnection(credentials: { apiKey: string; secretKey: string }): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const authHeader = "Basic " + Buffer.from(`${credentials.apiKey}:${credentials.secretKey}`).toString("base64");
      
      const response = await providerFetch("razorpay", `${this.baseUrl}/accounts`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader
        }
      });

      return {
        success: response.ok,
        error: !response.ok ? "Invalid Razorpay credentials" : undefined
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Connection test failed"
      };
    }
  }
}

export class FreechargeProvider implements UPIProviderInterface {
  private apiKey: string;
  private secretKey: string;
  private environment: "test" | "production";
  private baseUrl: string;

  constructor(apiKey: string, secretKey: string, environment: "test" | "production" = "production") {
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.environment = environment;
    this.baseUrl = environment === "production" 
      ? "https://api.freecharge.in" 
      : "https://api-test.freecharge.in";
  }

  private generateSignature(payload: string): string {
    return crypto.createHmac("sha256", this.secretKey).update(payload).digest("hex");
  }

  async createPayment(request: any): Promise<{
    success: boolean;
    paymentId?: string;
    checkoutUrl?: string;
    intentUrl?: string;
    qrCode?: string;
    error?: string;
  }> {
    try {
      const freechargeRequest = {
        merchantId: this.apiKey,
        orderId: request.paymentId,
        amount: Math.round(request.amount * 100), // Convert to paise
        currency: "INR",
        returnUrl: request.successUrl,
        notifyUrl: request.webhookUrl,
        customerEmail: request.customerEmail,
        customerPhone: request.customerPhone,
        customerName: request.customerName
      };

      const signature = this.generateSignature(JSON.stringify(freechargeRequest));

      const response = await providerFetch("freecharge", `${this.baseUrl}/v1/payments/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": signature,
          "X-Merchant-ID": this.apiKey
        },
        body: JSON.stringify(freechargeRequest)
      });

      const data = await response.json();

      if (data.success && data.paymentUrl) {
        return {
          success: true,
          paymentId: data.orderId || request.paymentId,
          checkoutUrl: data.paymentUrl
        };
      }

      return {
        success: false,
        error: data.message || "Freecharge payment creation failed"
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown Freecharge error"
      };
    }
  }

  async verifyPayment(paymentId: string): Promise<{
    success: boolean;
    status: "success" | "failed" | "pending";
    transactionId?: string;
    amount?: number;
    error?: string;
  }> {
    try {
      const response = await providerFetch("freecharge", `${this.baseUrl}/v1/payments/status/${paymentId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Merchant-ID": this.apiKey
        }
      });

      const data = await response.json();

      if (data.success) {
        return {
          success: true,
          status: data.status === "SUCCESS" ? "success" : 
                  data.status === "FAILED" ? "failed" : "pending",
          transactionId: data.transactionId,
          amount: data.amount / 100
        };
      }

      return {
        success: false,
        status: "failed",
        error: data.message || "Freecharge verification failed"
      };
    } catch (error) {
      return {
        success: false,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown Freecharge verification error"
      };
    }
  }

  async handleWebhook(payload: any, signature: string): Promise<{
    isValid: boolean;
    normalizedPayload?: NormalizedUPIWebhook;
    error?: string;
  }> {
    try {
      const expectedSignature = this.generateSignature(JSON.stringify(payload));
      
      if (signature !== expectedSignature) {
        return {
          isValid: false,
          error: "Invalid webhook signature"
        };
      }

      const normalized: NormalizedUPIWebhook = {
        paymentId: payload.orderId || "",
        status: payload.status === "SUCCESS" ? "success" : 
                payload.status === "FAILED" ? "failed" : "pending",
        amount: (payload.amount || 0) / 100,
        method: "upi",
        provider: "freecharge",
        transactionId: payload.transactionId || "",
        vpa: payload.vpa,
        timestamp: new Date().toISOString(),
        metadata: payload
      };

      return {
        isValid: true,
        normalizedPayload: normalized
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : "Webhook processing failed"
      };
    }
  }

  async testConnection(credentials: { apiKey: string; secretKey: string }): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const response = await providerFetch("freecharge", `${this.baseUrl}/v1/health`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Merchant-ID": credentials.apiKey
        }
      });

      return {
        success: response.ok,
        error: !response.ok ? "Freecharge server error" : undefined
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Connection test failed"
      };
    }
  }
}

export function createUPIProvider(
  provider: UPIProvider,
  apiKey: string,
  secretKey: string,
  environment: "test" | "production" = "production"
): UPIProviderInterface {
  switch (provider) {
    case "phonepe":
      return new PhonePeProvider(apiKey, secretKey, environment);
    case "paytm":
      return new PaytmProvider(apiKey, secretKey, environment);
    case "razorpay":
      return new RazorpayProvider(apiKey, secretKey, environment);
    case "freecharge":
      return new FreechargeProvider(apiKey, secretKey, environment);
    default:
      throw new AppError(400, "unsupported_provider", `UPI provider ${provider} is not supported`);
  }
}
