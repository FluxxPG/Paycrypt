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
};
export const supportedAssets = ["BTC", "ETH", "USDT"];
export const supportedNetworks = ["BTC", "ERC20", "TRC20", "SOL"];
export const paymentStatusSchema = z.enum([
    "created",
    "pending",
    "confirmed",
    "failed",
    "expired"
]);
export const createPaymentSchema = z.object({
    amountFiat: z.number().positive(),
    fiatCurrency: z.string().default("INR"),
    settlementCurrency: z.enum(supportedAssets),
    network: z.enum(supportedNetworks),
    customerEmail: z.string().email().optional(),
    customerName: z.string().optional(),
    description: z.string().min(3).max(280),
    metadata: z.record(z.string(), z.string()).default({}),
    successUrl: z.string().url(),
    cancelUrl: z.string().url(),
    expiresInMinutes: z.number().int().min(5).max(180).default(30)
});
export const createPaymentLinkSchema = z.object({
    title: z.string().min(3).max(120),
    description: z.string().min(3).max(280),
    amountFiat: z.number().positive(),
    fiatCurrency: z.string().default("INR"),
    settlementCurrency: z.enum(supportedAssets),
    network: z.enum(supportedNetworks),
    successUrl: z.string().url(),
    cancelUrl: z.string().url()
});
export const createWebhookEndpointSchema = z.object({
    url: z.string().url(),
    events: z.array(z.enum(["payment.created", "payment.pending", "payment.confirmed", "payment.failed"])),
    isActive: z.boolean().default(true)
});
export const apiKeyScopeSchema = z.enum([
    "payments:write",
    "payments:read",
    "payment_links:write",
    "transactions:read",
    "webhooks:write",
    "subscriptions:read"
]);
export const merchantFeatureSchema = z.object({
    custodialEnabled: z.boolean(),
    nonCustodialEnabled: z.boolean(),
    priorityProcessing: z.boolean(),
    planCode: z.enum(["starter", "business", "premium", "custom"])
});
