import { planCatalog, type PlanCode, type SupportedNetwork } from "@cryptopay/shared";
import { nanoid } from "nanoid";
import { query, withTransaction } from "./db.js";
import { AppError } from "./errors.js";

type MerchantBillingRow = {
  merchant_id: string;
  merchant_status: string;
  merchant_non_custodial_enabled: boolean;
  subscription_status: string | null;
  plan_code: PlanCode | null;
  monthly_price_inr: string | null;
  transaction_limit: number | null;
};

type MonthlyCountRow = {
  total: number;
};

type BillingInvoiceRow = {
  id: string;
  invoice_number: string;
  merchant_id: string;
  subscription_id: string | null;
  plan_code: PlanCode;
  status: "issued" | "paid" | "overdue" | "void" | string;
  billing_period_start: string;
  billing_period_end: string;
  currency: string;
  subtotal_inr: string;
  tax_inr: string;
  total_inr: string;
  paid_amount_inr: string;
  due_at: string;
  paid_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type BillingSnapshot = {
  invoiceCount: number;
  totalInvoiced: number;
  paid: number;
  outstanding: number;
  overdue: number;
  currency: string;
};

const GST_RATE = 0.18;

const buildInvoiceNumber = () => `inv_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${nanoid(8)}`;

const buildInvoiceTotals = (monthlyPriceInr: number, setupFeeInr: number) => {
  const subtotal = Number((monthlyPriceInr + setupFeeInr).toFixed(2));
  const tax = Number((subtotal * GST_RATE).toFixed(2));
  const total = Number((subtotal + tax).toFixed(2));
  return { subtotal, tax, total };
};

const summarizeInvoices = (invoices: BillingInvoiceRow[]): BillingSnapshot =>
  invoices.reduce<BillingSnapshot>(
    (acc, invoice) => {
      const total = Number(invoice.total_inr);
      const paid = Number(invoice.paid_amount_inr);
      acc.totalInvoiced += total;
      acc.paid += paid;
      acc.outstanding += Math.max(0, total - paid);
      acc.overdue += invoice.status === "overdue" ? 1 : 0;
      acc.invoiceCount += 1;
      return acc;
    },
    {
      invoiceCount: 0,
      totalInvoiced: 0,
      paid: 0,
      outstanding: 0,
      overdue: 0,
      currency: "INR"
    }
  );

export const listBillingInvoices = async (merchantId: string) =>
  query<BillingInvoiceRow>(
    `select
      id,
      invoice_number,
      merchant_id,
      subscription_id,
      plan_code,
      status,
      billing_period_start,
      billing_period_end,
      currency,
      subtotal_inr,
      tax_inr,
      total_inr,
      paid_amount_inr,
      due_at,
      paid_at,
      metadata,
      created_at,
      updated_at
     from billing_invoices
     where merchant_id = $1
     order by created_at desc
     limit 12`,
    [merchantId]
  ).then((result) => result.rows);

export const getMerchantBillingContext = async (merchantId: string) => {
  const profileResult = await query<MerchantBillingRow>(
    `select
      m.status as merchant_status,
      m.non_custodial_enabled as merchant_non_custodial_enabled,
      s.status as subscription_status,
      s.plan_code,
      s.monthly_price_inr,
      s.transaction_limit
     from merchants m
     left join subscriptions s on s.merchant_id = m.id
     where m.id = $1
     limit 1`,
    [merchantId]
  );

  const profile = profileResult.rows[0];
  if (!profile) {
    throw new AppError(404, "merchant_not_found", "Merchant not found");
  }

  const transactionCountResult = await query<MonthlyCountRow>(
    `select count(*)::int as total
     from transactions
     where merchant_id = $1 and created_at >= date_trunc('month', now())`,
    [merchantId]
  );

  const planCode = profile.plan_code ?? "starter";
  const plan = planCatalog[planCode];
  const monthlyTransactions = transactionCountResult.rows[0]?.total ?? 0;
  const invoices = await listBillingInvoices(merchantId);
  const billing = summarizeInvoices(invoices);

  return {
    merchantStatus: profile.merchant_status,
    merchantNonCustodialEnabled: profile.merchant_non_custodial_enabled,
    subscriptionStatus: profile.subscription_status ?? "inactive",
    planCode,
    plan,
    monthlyTransactions,
    transactionLimit: profile.transaction_limit ?? plan.transactionLimit,
    monthlyPriceInr: Number(profile.monthly_price_inr ?? plan.monthlyPriceInr),
    billing,
    invoices
  };
};

export const assertMerchantPlatformAccess = async (merchantId: string) => {
  const context = await getMerchantBillingContext(merchantId);
  if (context.merchantStatus !== "active") {
    throw new AppError(403, "merchant_suspended", "Merchant account is not active");
  }
  if (context.subscriptionStatus !== "active") {
    throw new AppError(403, "subscription_inactive", "Subscription is not active");
  }
  return context;
};

export const assertMerchantCanAcceptPayment = async (
  merchantId: string,
  settlementCurrency: string,
  network: SupportedNetwork
) => {
  const context = await assertMerchantPlatformAccess(merchantId);

  const limit = context.transactionLimit;
  if (limit > 0 && context.monthlyTransactions >= limit) {
    throw new AppError(
      403,
      "plan_limit_exceeded",
      `Monthly transaction limit reached for your plan (${context.monthlyTransactions}/${limit})`
    );
  }

  return {
    settlementCurrency,
    network,
    ...context
  };
};

export const assertMerchantCanManageNonCustodialWallets = async (merchantId: string) => {
  const context = await assertMerchantPlatformAccess(merchantId);
  if (!(context.plan.nonCustodialEnabled && context.merchantNonCustodialEnabled)) {
    throw new AppError(
      403,
      "non_custodial_not_enabled",
      "Non-custodial wallets stay locked until Premium access and admin approval are active"
    );
  }
  return context;
};

export const changeSubscriptionPlan = async (
  merchantId: string,
  planCode: PlanCode,
  overrides?: {
    monthlyPriceInr?: number;
    transactionLimit?: number;
    setupFeeInr?: number;
    status?: string;
    metadata?: Record<string, unknown>;
    actorId?: string;
  }
) => {
  const plan = planCatalog[planCode];
  const monthlyPriceInr = overrides?.monthlyPriceInr ?? plan.monthlyPriceInr;
  const transactionLimit = overrides?.transactionLimit ?? plan.transactionLimit;
  const setupFeeInr = overrides?.setupFeeInr ?? 0;
  const status = overrides?.status ?? "active";
  const metadata = JSON.stringify({
    ...(overrides?.metadata ?? {}),
    updatedBy: overrides?.actorId ?? "system"
  });
  const invoiceNumber = buildInvoiceNumber();
  const { subtotal, tax, total } = buildInvoiceTotals(monthlyPriceInr, setupFeeInr);

  await withTransaction(async (client) => {
    const subscriptionResult = await client.query<{ id: string }>(
      `insert into subscriptions (merchant_id, plan_code, status, monthly_price_inr, transaction_limit, setup_fee_inr, metadata, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb, now())
       on conflict (merchant_id) do update set
         plan_code = excluded.plan_code,
         status = excluded.status,
         monthly_price_inr = excluded.monthly_price_inr,
         transaction_limit = excluded.transaction_limit,
         setup_fee_inr = excluded.setup_fee_inr,
         metadata = excluded.metadata,
         updated_at = now()
       returning id`,
      [merchantId, planCode, status, monthlyPriceInr, transactionLimit, setupFeeInr, metadata]
    );

    await client.query(
      `insert into billing_invoices (
        invoice_number,
        merchant_id,
        subscription_id,
        plan_code,
        status,
        billing_period_start,
        billing_period_end,
        currency,
        subtotal_inr,
        tax_inr,
        total_inr,
        paid_amount_inr,
        due_at,
        metadata,
        created_at,
        updated_at
      ) values (
        $1,
        $2,
        $3,
        $4,
        'issued',
        date_trunc('month', now())::date,
        (date_trunc('month', now()) + interval '1 month - 1 day')::date,
        'INR',
        $5,
        $6,
        $7,
        0,
        now() + interval '7 days',
        $8::jsonb,
        now(),
        now()
      )`,
      [
        invoiceNumber,
        merchantId,
        subscriptionResult.rows[0].id,
        planCode,
        subtotal,
        tax,
        total,
        JSON.stringify({
          kind: "subscription_change",
          planCode,
          monthlyPriceInr,
          transactionLimit,
          setupFeeInr,
          status,
          updatedBy: overrides?.actorId ?? "system"
        })
      ]
    );

    if (overrides?.actorId) {
      await client.query(
        `insert into audit_logs (actor_id, merchant_id, action, payload)
         values ($1,$2,'subscription.updated',$3::jsonb)`,
        [overrides.actorId, merchantId, JSON.stringify({ planCode, monthlyPriceInr, transactionLimit, setupFeeInr, status })]
      );
    }
  });

  return getMerchantBillingContext(merchantId);
};
