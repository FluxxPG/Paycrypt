import { z } from "zod";

export const planCatalog = {
  starter: {
    code: "starter",
    name: "Starter",
    monthlyPriceInr: 10000,
    transactionLimit: 5000,
    priorityProcessing: false,
    nonCustodialEnabled: false
  },
  business: {
    code: "business",
    name: "Business",
    monthlyPriceInr: 15000,
    transactionLimit: 20000,
    priorityProcessing: true,
    nonCustodialEnabled: false
  },
  premium: {
    code: "premium",
    name: "Premium",
    monthlyPriceInr: 35000,
    transactionLimit: 100000,
    priorityProcessing: true,
    nonCustodialEnabled: true
  },
  custom: {
    code: "custom",
    name: "Custom",
    monthlyPriceInr: 0,
    transactionLimit: 0,
    priorityProcessing: true,
    nonCustodialEnabled: true
  }
} as const;

export type PlanCode = keyof typeof planCatalog;
export const supportedAssets = ["BTC", "ETH", "USDT"] as const;
export const supportedNetworks = ["BTC", "ERC20", "TRC20", "SOL"] as const;
export type SupportedAsset = (typeof supportedAssets)[number];
export type SupportedNetwork = (typeof supportedNetworks)[number];
export const assetNetworkMatrix = {
  BTC: ["BTC"],
  ETH: ["ERC20"],
  USDT: ["TRC20", "ERC20", "SOL"]
} as const satisfies Record<SupportedAsset, readonly SupportedNetwork[]>;

export const isNetworkSupportedForAsset = (asset: SupportedAsset, network: SupportedNetwork) =>
  (assetNetworkMatrix[asset] as readonly SupportedNetwork[]).includes(network);

export const checkoutRouteSchema = z
  .object({
    asset: z.enum(supportedAssets),
    network: z.enum(supportedNetworks)
  })
  .refine(({ asset, network }) => isNetworkSupportedForAsset(asset, network), {
    message: "Network is not supported for the selected asset",
    path: ["network"]
  });

const validateRequestedRoute = (
  value: {
    settlementCurrency?: SupportedAsset;
    network?: SupportedNetwork;
  },
  ctx: z.RefinementCtx
) => {
  const hasAsset = typeof value.settlementCurrency === "string";
  const hasNetwork = typeof value.network === "string";

  if (hasAsset !== hasNetwork) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "settlementCurrency and network must be provided together or omitted together",
      path: hasAsset ? ["network"] : ["settlementCurrency"]
    });
    return;
  }

  if (hasAsset && hasNetwork && !isNetworkSupportedForAsset(value.settlementCurrency!, value.network!)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Network is not supported for the selected asset",
      path: ["network"]
    });
  }
};

export const paymentStatusSchema = z.enum([
  "created",
  "pending",
  "confirmed",
  "failed",
  "expired"
]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const createPaymentSchema = z.object({
  amountFiat: z.number().positive(),
  fiatCurrency: z.string().default("INR"),
  settlementCurrency: z.enum(supportedAssets).optional(),
  network: z.enum(supportedNetworks).optional(),
  customerEmail: z.string().email().optional(),
  customerName: z.string().optional(),
  description: z.string().min(3).max(280),
  metadata: z.record(z.string(), z.string()).default({}),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  expiresInMinutes: z.number().int().min(5).max(180).default(30)
}).superRefine(validateRequestedRoute);

export const createPaymentLinkSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(3).max(280),
  amountFiat: z.number().positive(),
  fiatCurrency: z.string().default("INR"),
  settlementCurrency: z.enum(supportedAssets).optional(),
  network: z.enum(supportedNetworks).optional(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url()
}).superRefine(validateRequestedRoute);

export const createWebhookEndpointSchema = z.object({
  url: z.string().url(),
  events: z.array(
    z.enum(["payment.created", "payment.pending", "payment.confirmed", "payment.failed"])
  ),
  isActive: z.boolean().default(true)
});

export const apiKeyScopes = [
  "payments:write",
  "payments:read",
  "payment_links:write",
  "transactions:read",
  "webhooks:write",
  "subscriptions:read",
  "billing:read",
  "settlements:read"
] as const;

export const apiKeyScopeSchema = z.enum(apiKeyScopes);
export type ApiKeyScope = (typeof apiKeyScopes)[number];

export const merchantFeatureSchema = z.object({
  custodialEnabled: z.boolean(),
  nonCustodialEnabled: z.boolean(),
  priorityProcessing: z.boolean(),
  planCode: z.enum(["starter", "business", "premium", "custom"])
});

export type MerchantFeatures = z.infer<typeof merchantFeatureSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type CreatePaymentLinkInput = z.infer<typeof createPaymentLinkSchema>;
export type CreateWebhookEndpointInput = z.infer<typeof createWebhookEndpointSchema>;

export interface BillingSummary {
  invoiceCount: number;
  totalInvoiced: number;
  paid: number;
  outstanding: number;
  overdue: number;
  currency: string;
}

export interface BillingInvoice {
  id: string;
  invoice_number: string;
  merchant_id: string;
  subscription_id: string | null;
  plan_code: PlanCode;
  status: "issued" | "paid" | "overdue" | "void" | string;
  billing_period_start: string;
  billing_period_end: string;
  currency: string;
  subtotal_inr: number | string;
  tax_inr: number | string;
  total_inr: number | string;
  paid_amount_inr: number | string;
  due_at: string;
  paid_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SettlementRecord {
  id: string;
  merchant_id: string;
  payment_id: string;
  transaction_id: string | null;
  provider: string;
  asset: string;
  network: string;
  amount_crypto: number | string;
  amount_fiat: number | string;
  tx_hash: string;
  status: string;
  metadata: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RealtimeEventName =
  | "payment.created"
  | "payment.pending"
  | "payment.confirmed"
  | "payment.failed"
  | "payment.expired";

export interface RealtimePaymentEvent {
  type: RealtimeEventName;
  paymentId: string;
  merchantId: string;
  status: PaymentStatus;
  txHash?: string | null;
  confirmations?: number;
}

export interface ApiErrorPayload {
  error: string;
  message: string;
  details?: unknown;
}
