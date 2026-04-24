import { z } from "zod";

export const upiProviders = ["phonepe", "paytm", "razorpay", "freecharge"] as const;
export type UPIProvider = (typeof upiProviders)[number];

export const paymentMethods = ["crypto", "upi"] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const upiWebhookEvents = [
  "upi.payment.created",
  "upi.payment.pending", 
  "upi.payment.success",
  "upi.payment.failed",
  "upi.payment.expired"
] as const;
export type UPIWebhookEvent = (typeof upiWebhookEvents)[number];

export const upiProviderConfigSchema = z.object({
  providerName: z.enum(upiProviders),
  apiKey: z.string().min(1),
  secretKey: z.string().min(1),
  environment: z.enum(["test", "production"]).default("production"),
  priority: z.number().int().min(1).default(1),
  metadata: z.record(z.any()).default({})
});

export const upiManualConfigSchema = z.object({
  upiId: z.string().email(),
  qrCodeUrl: z.string().url().optional(),
  isActive: z.boolean().default(false)
});

export const merchantUpiSettingsSchema = z.object({
  upiEnabled: z.boolean().default(false),
  autoRoutingEnabled: z.boolean().default(true),
  fallbackToManual: z.boolean().default(false),
  manualModeEnabled: z.boolean().default(false),
  manualVpa: z.string().optional(),
  manualQrUrl: z.string().url().optional(),
  allowedProviders: z.array(z.enum(upiProviders)).default([...upiProviders]),
  providerPriority: z.record(z.number().int().min(1)).default({
    phonepe: 1,
    paytm: 2,
    razorpay: 3,
    freecharge: 4
  }),
  webhookSecret: z.string().optional()
});

// Extended payment schema for UPI
export const createUpiPaymentSchema = z.object({
  amountFiat: z.number().positive(),
  fiatCurrency: z.string().default("INR"),
  method: z.enum(paymentMethods).default("upi"),
  provider: z.enum(["auto", ...upiProviders]).default("auto"),
  customerEmail: z.string().email().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  description: z.string().min(3).max(280),
  metadata: z.record(z.string(), z.string()).default({}),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  expiresInMinutes: z.number().int().min(5).max(180).default(30)
});

export type UPIProviderConfig = z.infer<typeof upiProviderConfigSchema>;
export type UPIManualConfig = z.infer<typeof upiManualConfigSchema>;
export type MerchantUpiSettings = z.infer<typeof merchantUpiSettingsSchema>;
export type CreateUpiPaymentInput = z.infer<typeof createUpiPaymentSchema>;

// Provider-specific request/response types
export interface PhonePePaymentRequest {
  merchantId: string;
  merchantTransactionId: string;
  amount: number; // in paise
  merchantUserId: string;
  redirectUrl: string;
  redirectMode: string;
  callbackUrl: string;
  mobileNumber?: string;
  email?: string;
  shortName?: string;
  deviceContext?: {
    deviceOS: string;
  };
}

export interface PhonePePaymentResponse {
  success: boolean;
  code: string;
  message: string;
  data?: {
    merchantId: string;
    merchantTransactionId: string;
    transactionId?: string;
    amount: number;
    state: string;
    responseCode?: string;
    paymentInstrument?: {
      type: string;
      pgTransactionId?: string;
      pgServiceTransactionId?: string;
      bankTransactionId?: string;
      bankArn?: string;
    };
    payResponseCode?: string;
    payResponseMessage?: string;
    error?: string;
  };
}

export interface PaytmPaymentRequest {
  body: {
    requestType: string;
    mid: string;
    websiteName: string;
    orderId: string;
    callbackUrl: string;
    txnAmount: {
      value: string;
      currency: string;
    };
    userInfo: {
      custId: string;
      mobileNumber?: string;
      email?: string;
    };
  };
  head: {
    tokenType: string;
    version: string;
    channelCode: string;
    requestTimestamp: string;
    signature: string;
  };
}

export interface RazorpayPaymentRequest {
  amount: number; // in paise
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
  callback_url?: string;
  redirect?: boolean;
  customer_id?: string;
  email?: string;
  contact?: string;
}

export interface RazorpayPaymentResponse {
  id: string;
  entity: string;
  amount: number;
  currency: string;
  status: string;
  order_id?: string;
  invoice_id?: string;
  international: boolean;
  method?: string;
  amount_refunded: number;
  refund_status?: string;
  captured: boolean;
  description?: string;
  card_id?: string;
  bank?: string;
  wallet?: string;
  vpa?: string;
  email?: string;
  contact?: string;
  notes?: Record<string, string>;
  fee?: number;
  tax?: number;
  error_code?: string;
  error_description?: string;
  error_source?: string;
  error_step?: string;
  error_reason?: string;
  acquirer_data?: Record<string, any>;
  created_at: number;
}

// Normalized webhook payload
export interface NormalizedUPIWebhook {
  paymentId: string;
  status: "success" | "failed" | "pending";
  amount: number;
  method: "upi";
  provider: UPIProvider;
  transactionId: string;
  upiTransactionId?: string;
  vpa?: string;
  errorCode?: string;
  errorMessage?: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

// Provider abstraction interface
export interface UPIProviderInterface {
  createPayment(request: any): Promise<{
    success: boolean;
    paymentId?: string;
    checkoutUrl?: string;
    intentUrl?: string;
    qrCode?: string;
    error?: string;
  }>;
  
  verifyPayment(paymentId: string): Promise<{
    success: boolean;
    status?: "success" | "failed" | "pending";
    transactionId?: string;
    amount?: number;
    error?: string;
  }>;
  
  handleWebhook(payload: any, signature: string): Promise<{
    isValid: boolean;
    normalizedPayload?: NormalizedUPIWebhook;
    error?: string;
  }>;
  
  testConnection(credentials: { apiKey: string; secretKey: string }): Promise<{
    success: boolean;
    error?: string;
  }>;
}

// Multi-provider routing configuration
export interface ProviderRoutingConfig {
  enabled: boolean;
  strategy: "priority" | "load_balance" | "success_rate";
  fallbackEnabled: boolean;
  providers: Array<{
    name: UPIProvider;
    priority: number;
    weight?: number;
    successRate?: number;
    lastUsed?: Date;
  }>;
}

// Feature gating for UPI
export const upiFeatures = {
  basic_upi: "Basic UPI payments",
  multi_provider: "Multiple UPI providers",
  auto_routing: "Automatic provider routing",
  fallback_logic: "Provider fallback logic",
  webhook_normalization: "Webhook normalization",
  real_time_updates: "Real-time payment updates",
  advanced_analytics: "Advanced UPI analytics",
  custom_branding: "Custom branding options"
} as const;

export type UPIFeature = keyof typeof upiFeatures;
