import { z } from "zod";
export const planCatalog = {
    starter: {
        code: "starter",
        name: "Starter",
        monthlyPriceInr: 0,
        transactionLimit: 5000,
        priorityProcessing: false,
        nonCustodialEnabled: false,
        platformFeePercent: 1,
        nonCustodialWalletLimit: 0,
        setupFeeInr: 0,
        setupFeeUsdt: 0
    },
    custom_selective: {
        code: "custom_selective",
        name: "Custom Selective",
        monthlyPriceInr: 0,
        transactionLimit: 20000,
        priorityProcessing: true,
        nonCustodialEnabled: true,
        platformFeePercent: 2,
        nonCustodialWalletLimit: 1,
        setupFeeInr: 0,
        setupFeeUsdt: 0
    },
    custom_enterprise: {
        code: "custom_enterprise",
        name: "Custom Enterprise",
        monthlyPriceInr: 0,
        transactionLimit: 0,
        priorityProcessing: true,
        nonCustodialEnabled: true,
        platformFeePercent: 2,
        nonCustodialWalletLimit: -1,
        setupFeeInr: 10000,
        setupFeeUsdt: 10000
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
    planCode: z.enum(["starter", "custom_selective", "custom_enterprise"])
});
