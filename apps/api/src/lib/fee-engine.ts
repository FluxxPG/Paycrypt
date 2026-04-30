import { planCatalog, type PlanCode } from "@cryptopay/shared";
import { query } from "./db.js";

type FeeConfigRow = {
  scope: "global" | "plan" | "merchant" | "payment" | string;
  plan_code: string | null;
  merchant_id: string | null;
  chain: string | null;
  payment_id: string | null;
  fee_percent: string | number;
  min_fee_usdt: string | number | null;
  max_fee_usdt: string | number | null;
  note: string | null;
};

type PlanCatalogRow = {
  code: string;
  name: string;
  monthly_price_inr: string | number;
  transaction_limit: number;
  setup_fee_inr: string | number;
  setup_fee_usdt: string | number;
  platform_fee_percent: string | number;
  non_custodial_wallet_limit: number;
  upi_enabled: boolean;
  upi_provider_limit: number;
  binance_enabled: boolean;
  trust_wallet_enabled: boolean;
};

const toNumber = (value: string | number | null | undefined) => Number(value ?? 0);

export const getPlanDefinition = async (planCode: PlanCode) => {
  const fallback = planCatalog[planCode];
  try {
    const result = await query<PlanCatalogRow>(
      `select
          code,
          name,
          monthly_price_inr,
          transaction_limit,
          setup_fee_inr,
          setup_fee_usdt,
          platform_fee_percent,
          non_custodial_wallet_limit,
          upi_enabled,
          upi_provider_limit,
          binance_enabled,
          trust_wallet_enabled
       from plan_catalog
       where code = $1 and is_active = true
       limit 1`,
      [planCode]
    );
    const row = result.rows[0];
    if (!row) {
      return fallback;
    }

    return {
      code: planCode,
      name: row.name,
      monthlyPriceInr: toNumber(row.monthly_price_inr),
      transactionLimit: Number(row.transaction_limit ?? fallback.transactionLimit),
      priorityProcessing: fallback.priorityProcessing,
      nonCustodialEnabled: Number(row.non_custodial_wallet_limit ?? 0) !== 0,
      platformFeePercent: toNumber(row.platform_fee_percent),
      nonCustodialWalletLimit: Number(row.non_custodial_wallet_limit ?? fallback.nonCustodialWalletLimit),
      setupFeeInr: toNumber(row.setup_fee_inr),
      setupFeeUsdt: toNumber(row.setup_fee_usdt),
      upiEnabled: Boolean(row.upi_enabled),
      upiProviderLimit: Number(row.upi_provider_limit ?? fallback.upiProviderLimit),
      binanceEnabled: Boolean(row.binance_enabled),
      trustWalletEnabled: Boolean(row.trust_wallet_enabled)
    };
  } catch {
    return fallback;
  }
};

export const resolvePlatformFeeConfig = async (input: {
  merchantId: string;
  planCode: PlanCode;
  chain?: string | null;
  paymentId?: string | null;
}) => {
  const fallbackPlan = await getPlanDefinition(input.planCode);
  const result = await query<FeeConfigRow>(
    `select
        scope,
        plan_code,
        merchant_id,
        chain,
        payment_id,
        fee_percent,
        min_fee_usdt,
        max_fee_usdt,
        note
     from fee_configs
     where is_active = true
       and (valid_from is null or valid_from <= now())
       and (valid_until is null or valid_until >= now())
       and (
         (scope = 'payment' and payment_id = $4)
         or (scope = 'merchant' and merchant_id = $1)
         or (scope = 'plan' and plan_code = $2)
         or (scope = 'global')
       )
       and (chain is null or chain = $3)
     order by
       case scope
         when 'payment' then 1
         when 'merchant' then 2
         when 'plan' then 3
         when 'global' then 4
         else 5
       end asc,
       case when chain = $3 then 0 else 1 end asc,
       created_at desc
     limit 1`,
    [input.merchantId, input.planCode, input.chain ?? null, input.paymentId ?? null]
  );

  const row = result.rows[0];
  return {
    feePercent: Number(row?.fee_percent ?? fallbackPlan.platformFeePercent ?? 1),
    scope: row?.scope ?? "plan_default",
    minFeeUsdt: toNumber(row?.min_fee_usdt),
    maxFeeUsdt: toNumber(row?.max_fee_usdt),
    note: row?.note ?? null
  };
};
