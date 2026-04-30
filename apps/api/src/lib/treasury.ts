import type { PoolClient, QueryResultRow } from "pg";
import type { SupportedAsset } from "@cryptopay/shared";
import { applyBinanceWithdrawal } from "./binance.js";
import { query, withTransaction } from "./db.js";
import { AppError } from "./errors.js";
import { quoteCryptoAmount } from "./pricing.js";

type OwnerType = "platform" | "merchant";
type TreasuryBalanceType = "inbound" | "aggregation" | "cold_vault" | "withdrawable" | "pending";
type TreasuryTransactionType =
  | "payment_received"
  | "fee_deducted"
  | "settlement_credited"
  | "withdrawal_requested"
  | "withdrawal_processed"
  | "withdrawal_failed"
  | "sweep_to_aggregation"
  | "sweep_to_cold"
  | "gas_fee_deducted"
  | "adjustment_credit"
  | "adjustment_debit"
  | "batch_payout";

type TreasuryBalanceRow = {
  id: string;
  owner_type: OwnerType;
  owner_id: string;
  asset: string;
  network: string;
  wallet_address: string | null;
  balance_type: TreasuryBalanceType;
  amount_crypto: number | string;
  amount_fiat_equivalent: number | string;
  last_updated_at: string;
  created_at: string;
};

type WithdrawalRow = {
  id: string;
  owner_type: OwnerType;
  owner_id: string;
  asset: string;
  network: string;
  amount_crypto: number | string;
  amount_fiat_equivalent: number | string;
  destination_address: string;
  destination_wallet_provider: string | null;
  gas_fee_crypto: number | string;
  gas_fee_fiat: number | string;
  penalty_fee_crypto: number | string;
  penalty_fee_fiat: number | string;
  final_amount_crypto: number | string;
  tx_hash: string | null;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  rejection_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  processed_by: string | null;
  processed_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

const LARGE_WITHDRAWAL_APPROVAL_THRESHOLD_FIAT = 1_000;

const toNumber = (value: string | number | null | undefined, scale = 8) => {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(scale));
};

const getOwnerLabel = (ownerType: OwnerType, ownerId: string) => (ownerType === "platform" ? "platform" : ownerId);

const getBalanceRow = async (
  client: PoolClient,
  ownerType: OwnerType,
  ownerId: string,
  asset: string,
  network: string,
  balanceType: TreasuryBalanceType
) => {
  const result = await client.query<TreasuryBalanceRow>(
    `select *
     from treasury_balances
     where owner_type = $1 and owner_id = $2 and asset = $3 and network = $4 and balance_type = $5
     limit 1`,
    [ownerType, ownerId, asset, network, balanceType]
  );
  return result.rows[0] ?? null;
};

const mutateBalance = async (
  client: PoolClient,
  input: {
    ownerType: OwnerType;
    ownerId: string;
    asset: string;
    network: string;
    balanceType: TreasuryBalanceType;
    amountCryptoDelta: number;
    amountFiatDelta: number;
    walletAddress?: string | null;
    requireSufficientFunds?: boolean;
  }
) => {
  const current = await getBalanceRow(
    client,
    input.ownerType,
    input.ownerId,
    input.asset,
    input.network,
    input.balanceType
  );

  const nextCrypto = Number(
    (toNumber(current?.amount_crypto, 8) + toNumber(input.amountCryptoDelta, 8)).toFixed(8)
  );
  const nextFiat = Number(
    (toNumber(current?.amount_fiat_equivalent, 2) + toNumber(input.amountFiatDelta, 2)).toFixed(2)
  );

  if (input.requireSufficientFunds && nextCrypto < 0) {
    throw new AppError(
      400,
      "insufficient_balance",
      `Insufficient ${input.balanceType} balance for ${getOwnerLabel(input.ownerType, input.ownerId)}`
    );
  }

  if (current) {
    await client.query(
      `update treasury_balances
       set amount_crypto = $2,
           amount_fiat_equivalent = $3,
           wallet_address = coalesce($4, wallet_address),
           last_updated_at = now()
       where id = $1`,
      [current.id, nextCrypto, nextFiat, input.walletAddress ?? null]
    );
    return {
      beforeCrypto: toNumber(current.amount_crypto, 8),
      afterCrypto: nextCrypto,
      beforeFiat: toNumber(current.amount_fiat_equivalent, 2),
      afterFiat: nextFiat
    };
  }

  await client.query(
    `insert into treasury_balances (
      owner_type, owner_id, asset, network, wallet_address, balance_type, amount_crypto, amount_fiat_equivalent
    ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.ownerType,
      input.ownerId,
      input.asset,
      input.network,
      input.walletAddress ?? null,
      input.balanceType,
      nextCrypto,
      nextFiat
    ]
  );

  return {
    beforeCrypto: 0,
    afterCrypto: nextCrypto,
    beforeFiat: 0,
    afterFiat: nextFiat
  };
};

const insertTreasuryTransaction = async (
  client: PoolClient,
  input: {
    ownerType: OwnerType;
    ownerId: string;
    asset: string;
    network: string;
    transactionType: TreasuryTransactionType;
    amountCrypto: number;
    amountFiatEquivalent: number;
    fromBalanceType?: string;
    toBalanceType?: string;
    relatedPaymentId?: string;
    relatedWithdrawalId?: string;
    relatedSettlementId?: string;
    txHash?: string | null;
    description?: string;
    metadata?: Record<string, unknown>;
    status?: "pending" | "completed" | "failed";
  }
) => {
  await client.query(
    `insert into treasury_transactions (
      owner_type, owner_id, asset, network, transaction_type, amount_crypto, amount_fiat_equivalent,
      from_balance_type, to_balance_type, related_payment_id, related_withdrawal_id, related_settlement_id,
      tx_hash, description, metadata, status
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16)`,
    [
      input.ownerType,
      input.ownerId,
      input.asset,
      input.network,
      input.transactionType,
      input.amountCrypto,
      input.amountFiatEquivalent,
      input.fromBalanceType ?? null,
      input.toBalanceType ?? null,
      input.relatedPaymentId ?? null,
      input.relatedWithdrawalId ?? null,
      input.relatedSettlementId ?? null,
      input.txHash ?? null,
      input.description ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.status ?? "completed"
    ]
  );
};

const insertFeeRecord = async (
  client: PoolClient,
  input: {
    ownerType: OwnerType;
    ownerId: string;
    paymentId: string;
    asset: string;
    network: string;
    feePercent: number;
    amountCrypto: number;
    amountFiat: number;
    exchangeRate: number;
    feeType: "platform" | "gas" | "withdrawal_penalty";
    description?: string;
  }
) => {
  await client.query(
    `insert into treasury_fees (
      owner_type, owner_id, payment_id, asset, network, fee_percent, amount_crypto,
      amount_fiat, exchange_rate, fee_type, description
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      input.ownerType,
      input.ownerId,
      input.paymentId,
      input.asset,
      input.network,
      input.feePercent,
      input.amountCrypto,
      input.amountFiat,
      input.exchangeRate,
      input.feeType,
      input.description ?? null
    ]
  );
};

const assertDestinationWhitelisted = async (
  ownerType: OwnerType,
  ownerId: string,
  asset: string,
  network: string,
  destinationAddress: string
) => {
  if (ownerType === "platform") {
    return;
  }

  const result = await query<{ source: string }>(
    `select 'wallet' as source
       from wallets
      where merchant_id = $1
        and asset = $2
        and network = $3
        and address = $4
        and is_active = true
      union all
      select 'whitelist' as source
       from withdrawal_whitelist
      where merchant_id = $1
        and asset = $2
        and network = $3
        and address = $4
        and is_active = true
      limit 1`,
    [ownerId, asset, network, destinationAddress]
  );

  if (!result.rows[0]) {
    throw new AppError(
      403,
      "withdrawal_address_not_whitelisted",
      "Withdrawal destination must be an active connected wallet or whitelisted treasury address"
    );
  }
};

const buildExecutionMetadata = (metadata: Record<string, unknown> | null | undefined) =>
  typeof metadata === "object" && metadata ? metadata : {};

const resolveWithdrawalQuote = async (asset: SupportedAsset, amountCrypto: number) => {
  const quote = await quoteCryptoAmount(asset, "USD", 1);
  return {
    exchangeRate: quote.exchangeRate,
    amountFiat: Number((amountCrypto * quote.exchangeRate).toFixed(2))
  };
};

const resolveBinanceWithdrawal = async (withdrawal: WithdrawalRow) => {
  const result = await applyBinanceWithdrawal({
    asset: withdrawal.asset,
    network: withdrawal.network,
    amount: toNumber(withdrawal.final_amount_crypto, 8),
    address: withdrawal.destination_address
  });

  return {
    provider: "binance",
    providerReference: result.id ?? null,
    txHash: null as string | null
  };
};

export const getTreasuryBalance = async (
  ownerType: OwnerType,
  ownerId: string,
  asset: string,
  network: string,
  balanceType: TreasuryBalanceType
) => {
  const result = await query<TreasuryBalanceRow>(
    `select *
     from treasury_balances
     where owner_type = $1 and owner_id = $2 and asset = $3 and network = $4 and balance_type = $5
     limit 1`,
    [ownerType, ownerId, asset, network, balanceType]
  );
  return result.rows[0] ?? null;
};

export const updateTreasuryBalance = async (
  ownerType: OwnerType,
  ownerId: string,
  asset: string,
  network: string,
  balanceType: TreasuryBalanceType,
  amountDelta: number,
  fiatEquivalent: number
) =>
  withTransaction(async (client) =>
    mutateBalance(client, {
      ownerType,
      ownerId,
      asset,
      network,
      balanceType,
      amountCryptoDelta: amountDelta,
      amountFiatDelta: fiatEquivalent
    })
  );

export const recordTreasuryTransaction = async (input: {
  ownerType: OwnerType;
  ownerId: string;
  asset: string;
  network: string;
  transactionType: TreasuryTransactionType;
  amountCrypto: number;
  amountFiatEquivalent: number;
  fromBalanceType?: string;
  toBalanceType?: string;
  relatedPaymentId?: string;
  relatedWithdrawalId?: string;
  relatedSettlementId?: string;
  txHash?: string | null;
  description?: string;
  metadata?: Record<string, unknown>;
  status?: "pending" | "completed" | "failed";
}) =>
  withTransaction(async (client) => insertTreasuryTransaction(client, input));

export const recordFeeDeduction = async (input: {
  ownerType: OwnerType;
  ownerId: string;
  paymentId: string;
  asset: string;
  network: string;
  feePercent: number;
  amountCrypto: number;
  amountFiat: number;
  exchangeRate: number;
  feeType: "platform" | "gas" | "withdrawal_penalty";
  description?: string;
}) =>
  withTransaction(async (client) => insertFeeRecord(client, input));

export const deductPlatformFee = async (
  paymentId: string,
  merchantId: string,
  asset: string,
  network: string,
  amountCrypto: number,
  amountFiat: number,
  exchangeRate: number,
  feePercent: number
) => {
  const feeAmountCrypto = Number((amountCrypto * (feePercent / 100)).toFixed(8));
  const feeAmountFiat = Number((amountFiat * (feePercent / 100)).toFixed(2));
  const netAmountCrypto = Number((amountCrypto - feeAmountCrypto).toFixed(8));
  const netAmountFiat = Number((amountFiat - feeAmountFiat).toFixed(2));

  return withTransaction(async (client) => {
    await insertFeeRecord(client, {
      ownerType: "platform",
      ownerId: "platform",
      paymentId,
      asset,
      network,
      feePercent,
      amountCrypto: feeAmountCrypto,
      amountFiat: feeAmountFiat,
      exchangeRate,
      feeType: "platform",
      description: "Platform fee deducted at payment credit"
    });

    await mutateBalance(client, {
      ownerType: "platform",
      ownerId: "platform",
      asset,
      network,
      balanceType: "inbound",
      amountCryptoDelta: feeAmountCrypto,
      amountFiatDelta: feeAmountFiat
    });

    await insertTreasuryTransaction(client, {
      ownerType: "platform",
      ownerId: "platform",
      asset,
      network,
      transactionType: "fee_deducted",
      amountCrypto: feeAmountCrypto,
      amountFiatEquivalent: feeAmountFiat,
      toBalanceType: "inbound",
      relatedPaymentId: paymentId,
      description: "Platform fee booked from payment settlement",
      metadata: { merchantId, feePercent }
    });

    await mutateBalance(client, {
      ownerType: "merchant",
      ownerId: merchantId,
      asset,
      network,
      balanceType: "pending",
      amountCryptoDelta: netAmountCrypto,
      amountFiatDelta: netAmountFiat
    });

    await insertTreasuryTransaction(client, {
      ownerType: "merchant",
      ownerId: merchantId,
      asset,
      network,
      transactionType: "payment_received",
      amountCrypto: netAmountCrypto,
      amountFiatEquivalent: netAmountFiat,
      toBalanceType: "pending",
      relatedPaymentId: paymentId,
      description: "Merchant pending treasury credit after platform fee",
      metadata: {
        feePercent,
        feeAmountCrypto,
        feeAmountFiat
      }
    });

    return {
      feeAmountCrypto,
      feeAmountFiat,
      netAmountCrypto,
      netAmountFiat
    };
  });
};

export const getWithdrawalFeeConfig = async (asset: string, network: string) => {
  const result = await query<{
    min_withdrawal_amount_fiat: number | string;
    min_withdrawal_penalty_fiat: number | string;
    min_withdrawal_penalty_crypto: number | string;
    gas_fee_fixed_crypto: number | string;
    gas_fee_fixed_fiat: number | string;
    gas_fee_percent: number | string;
  }>(
    `select min_withdrawal_amount_fiat,
            min_withdrawal_penalty_fiat,
            min_withdrawal_penalty_crypto,
            gas_fee_fixed_crypto,
            gas_fee_fixed_fiat,
            gas_fee_percent
     from withdrawal_fee_config
     where asset = $1 and network = $2 and is_active = true
     limit 1`,
    [asset, network]
  );
  return result.rows[0] ?? null;
};

export const calculateWithdrawalFees = async (
  asset: string,
  network: string,
  amountCrypto: number,
  amountFiat: number
) => {
  const config = await getWithdrawalFeeConfig(asset, network);
  if (!config) {
    throw new AppError(404, "withdrawal_config_not_found", "Withdrawal fee configuration not found");
  }

  const gasFeeFixedCrypto = toNumber(config.gas_fee_fixed_crypto, 8);
  const gasFeeFixedFiat = toNumber(config.gas_fee_fixed_fiat, 2);
  const gasFeePercent = toNumber(config.gas_fee_percent, 4);
  const minWithdrawalAmountFiat = toNumber(config.min_withdrawal_amount_fiat, 2);
  const minWithdrawalPenaltyFiat = toNumber(config.min_withdrawal_penalty_fiat, 2);
  const minWithdrawalPenaltyCrypto = toNumber(config.min_withdrawal_penalty_crypto, 8);

  let penaltyFeeCrypto = 0;
  let penaltyFeeFiat = 0;
  let gasFeeCrypto = gasFeeFixedCrypto;
  let gasFeeFiat = gasFeeFixedFiat;

  if (amountFiat < minWithdrawalAmountFiat) {
    if (minWithdrawalPenaltyCrypto > 0) {
      penaltyFeeCrypto = minWithdrawalPenaltyCrypto;
      penaltyFeeFiat = Number((penaltyFeeCrypto * (amountFiat / Math.max(amountCrypto, 0.00000001))).toFixed(2));
    } else {
      penaltyFeeFiat = minWithdrawalPenaltyFiat;
      penaltyFeeCrypto = Number((penaltyFeeFiat / Math.max(amountFiat / amountCrypto, 0.00000001)).toFixed(8));
    }
  }

  if (gasFeePercent > 0) {
    gasFeeFiat += Number((amountFiat * (gasFeePercent / 100)).toFixed(2));
    gasFeeCrypto += Number((amountCrypto * (gasFeePercent / 100)).toFixed(8));
  }

  const totalDeductionCrypto = Number((penaltyFeeCrypto + gasFeeCrypto).toFixed(8));
  const totalDeductionFiat = Number((penaltyFeeFiat + gasFeeFiat).toFixed(2));

  return {
    penaltyFeeCrypto,
    penaltyFeeFiat,
    gasFeeCrypto,
    gasFeeFiat,
    totalDeductionCrypto,
    totalDeductionFiat,
    finalAmountCrypto: Number((amountCrypto - totalDeductionCrypto).toFixed(8)),
    finalAmountFiat: Number((amountFiat - totalDeductionFiat).toFixed(2)),
    config: {
      minWithdrawalAmountFiat,
      minWithdrawalPenaltyFiat,
      minWithdrawalPenaltyCrypto,
      gasFeeFixedCrypto,
      gasFeeFixedFiat,
      gasFeePercent
    }
  };
};

export const createWithdrawalRequest = async (
  ownerType: OwnerType,
  ownerId: string,
  input: {
    asset: SupportedAsset;
    network: string;
    amountCrypto: number;
    destinationAddress: string;
    destinationWalletProvider?: string;
  }
) => {
  if (!Number.isFinite(input.amountCrypto) || input.amountCrypto <= 0) {
    throw new AppError(400, "invalid_withdrawal_amount", "Withdrawal amount must be greater than zero");
  }

  await assertDestinationWhitelisted(
    ownerType,
    ownerId,
    input.asset,
    input.network,
    input.destinationAddress
  );

  const balance = await getTreasuryBalance(ownerType, ownerId, input.asset, input.network, "withdrawable");
  if (!balance || toNumber(balance.amount_crypto, 8) < input.amountCrypto) {
    throw new AppError(400, "insufficient_balance", "Insufficient withdrawable balance");
  }

  const { exchangeRate, amountFiat } = await resolveWithdrawalQuote(input.asset, input.amountCrypto);
  const fees = await calculateWithdrawalFees(input.asset, input.network, input.amountCrypto, amountFiat);
  if (fees.finalAmountCrypto <= 0) {
    throw new AppError(400, "invalid_withdrawal_amount", "Withdrawal amount after fees is too low");
  }

  return withTransaction(async (client) => {
    const result = await client.query<{ id: string }>(
      `insert into treasury_withdrawals (
        owner_type, owner_id, asset, network, amount_crypto, amount_fiat_equivalent,
        destination_address, destination_wallet_provider, gas_fee_crypto, gas_fee_fiat,
        penalty_fee_crypto, penalty_fee_fiat, final_amount_crypto, metadata
      ) values (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb
      )
      returning id`,
      [
        ownerType,
        ownerId,
        input.asset,
        input.network,
        input.amountCrypto,
        amountFiat,
        input.destinationAddress,
        input.destinationWalletProvider ?? null,
        fees.gasFeeCrypto,
        fees.gasFeeFiat,
        fees.penaltyFeeCrypto,
        fees.penaltyFeeFiat,
        fees.finalAmountCrypto,
        JSON.stringify({
          exchangeRate,
          requiresApproval: amountFiat >= LARGE_WITHDRAWAL_APPROVAL_THRESHOLD_FIAT,
          requestedAt: new Date().toISOString()
        })
      ]
    );

    const withdrawalId = result.rows[0].id;

    await mutateBalance(client, {
      ownerType,
      ownerId,
      asset: input.asset,
      network: input.network,
      balanceType: "withdrawable",
      amountCryptoDelta: -input.amountCrypto,
      amountFiatDelta: -amountFiat,
      requireSufficientFunds: true
    });

    await mutateBalance(client, {
      ownerType,
      ownerId,
      asset: input.asset,
      network: input.network,
      balanceType: "pending",
      amountCryptoDelta: input.amountCrypto,
      amountFiatDelta: amountFiat
    });

    await insertTreasuryTransaction(client, {
      ownerType,
      ownerId,
      asset: input.asset,
      network: input.network,
      transactionType: "withdrawal_requested",
      amountCrypto: input.amountCrypto,
      amountFiatEquivalent: amountFiat,
      fromBalanceType: "withdrawable",
      toBalanceType: "pending",
      relatedWithdrawalId: withdrawalId,
      description: "Treasury withdrawal requested",
      metadata: {
        destinationAddress: input.destinationAddress,
        destinationWalletProvider: input.destinationWalletProvider ?? null,
        fees
      },
      status: "pending"
    });

    return {
      withdrawalId,
      fees,
      requiresApproval: amountFiat >= LARGE_WITHDRAWAL_APPROVAL_THRESHOLD_FIAT
    };
  });
};

export const processWithdrawal = async (withdrawalId: string, performedBy: string) => {
  const withdrawalResult = await query<WithdrawalRow>(
    `select *
     from treasury_withdrawals
     where id = $1 and status = 'pending'
     limit 1`,
    [withdrawalId]
  );
  const withdrawal = withdrawalResult.rows[0];

  if (!withdrawal) {
    throw new AppError(404, "withdrawal_not_found", "Withdrawal not found or already processed");
  }

  const withdrawalMetadata = buildExecutionMetadata(withdrawal.metadata);
  const requiresApproval = Boolean(withdrawalMetadata.requiresApproval);
  if (requiresApproval && !withdrawal.approved_at) {
    throw new AppError(409, "withdrawal_requires_approval", "Admin approval is required before processing this withdrawal");
  }

  let providerExecution:
    | {
        provider: string;
        providerReference: string | null;
        txHash: string | null;
      }
    | null = null;

  try {
    providerExecution = await resolveBinanceWithdrawal(withdrawal);
  } catch (error) {
    await query(
      `update treasury_withdrawals
       set status = 'failed',
           rejection_reason = $2,
           processed_by = $3,
           updated_at = now()
       where id = $1`,
      [withdrawalId, error instanceof Error ? error.message : "Withdrawal execution failed", performedBy]
    );

    await withTransaction(async (client) => {
      await mutateBalance(client, {
        ownerType: withdrawal.owner_type,
        ownerId: withdrawal.owner_id,
        asset: withdrawal.asset,
        network: withdrawal.network,
        balanceType: "pending",
        amountCryptoDelta: -toNumber(withdrawal.amount_crypto, 8),
        amountFiatDelta: -toNumber(withdrawal.amount_fiat_equivalent, 2)
      });
      await mutateBalance(client, {
        ownerType: withdrawal.owner_type,
        ownerId: withdrawal.owner_id,
        asset: withdrawal.asset,
        network: withdrawal.network,
        balanceType: "withdrawable",
        amountCryptoDelta: toNumber(withdrawal.amount_crypto, 8),
        amountFiatDelta: toNumber(withdrawal.amount_fiat_equivalent, 2)
      });
      await insertTreasuryTransaction(client, {
        ownerType: withdrawal.owner_type,
        ownerId: withdrawal.owner_id,
        asset: withdrawal.asset,
        network: withdrawal.network,
        transactionType: "withdrawal_failed",
        amountCrypto: toNumber(withdrawal.amount_crypto, 8),
        amountFiatEquivalent: toNumber(withdrawal.amount_fiat_equivalent, 2),
        fromBalanceType: "pending",
        toBalanceType: "withdrawable",
        relatedWithdrawalId: withdrawal.id,
        description: "Treasury withdrawal failed and balance was restored",
        metadata: {
          error: error instanceof Error ? error.message : "Withdrawal execution failed"
        },
        status: "failed"
      });
    });
    throw error;
  }

  return withTransaction(async (client) => {
    await mutateBalance(client, {
      ownerType: withdrawal.owner_type,
      ownerId: withdrawal.owner_id,
      asset: withdrawal.asset,
      network: withdrawal.network,
      balanceType: "pending",
      amountCryptoDelta: -toNumber(withdrawal.amount_crypto, 8),
      amountFiatDelta: -toNumber(withdrawal.amount_fiat_equivalent, 2),
      requireSufficientFunds: true
    });

    const totalFeeCrypto = Number(
      (toNumber(withdrawal.gas_fee_crypto, 8) + toNumber(withdrawal.penalty_fee_crypto, 8)).toFixed(8)
    );
    const totalFeeFiat = Number(
      (toNumber(withdrawal.gas_fee_fiat, 2) + toNumber(withdrawal.penalty_fee_fiat, 2)).toFixed(2)
    );

    if (toNumber(withdrawal.gas_fee_crypto, 8) > 0) {
      await insertFeeRecord(client, {
        ownerType: "platform",
        ownerId: "platform",
        paymentId: withdrawal.id,
        asset: withdrawal.asset,
        network: withdrawal.network,
        feePercent: 0,
        amountCrypto: toNumber(withdrawal.gas_fee_crypto, 8),
        amountFiat: toNumber(withdrawal.gas_fee_fiat, 2),
        exchangeRate: 1,
        feeType: "gas",
        description: "Treasury gas fee collected on withdrawal"
      });
    }

    if (toNumber(withdrawal.penalty_fee_crypto, 8) > 0) {
      await insertFeeRecord(client, {
        ownerType: "platform",
        ownerId: "platform",
        paymentId: withdrawal.id,
        asset: withdrawal.asset,
        network: withdrawal.network,
        feePercent: 0,
        amountCrypto: toNumber(withdrawal.penalty_fee_crypto, 8),
        amountFiat: toNumber(withdrawal.penalty_fee_fiat, 2),
        exchangeRate: 1,
        feeType: "withdrawal_penalty",
        description: "Treasury early-withdrawal penalty collected"
      });
    }

    if (totalFeeCrypto > 0 || totalFeeFiat > 0) {
      await mutateBalance(client, {
        ownerType: "platform",
        ownerId: "platform",
        asset: withdrawal.asset,
        network: withdrawal.network,
        balanceType: "inbound",
        amountCryptoDelta: totalFeeCrypto,
        amountFiatDelta: totalFeeFiat
      });
    }

    const nextStatus = providerExecution?.txHash ? "completed" : "processing";
    const metadata = {
      ...withdrawalMetadata,
      provider: providerExecution?.provider ?? "binance",
      providerReference: providerExecution?.providerReference,
      submissionRecordedAt: new Date().toISOString()
    };

    await client.query(
      `update treasury_withdrawals
       set status = $2,
           tx_hash = coalesce($3, tx_hash),
           processed_by = $4,
           processed_at = now(),
           metadata = $5::jsonb,
           updated_at = now()
       where id = $1`,
      [
        withdrawal.id,
        nextStatus,
        providerExecution?.txHash ?? null,
        performedBy,
        JSON.stringify(metadata)
      ]
    );

    await insertTreasuryTransaction(client, {
      ownerType: withdrawal.owner_type,
      ownerId: withdrawal.owner_id,
      asset: withdrawal.asset,
      network: withdrawal.network,
      transactionType: "withdrawal_processed",
      amountCrypto: toNumber(withdrawal.final_amount_crypto, 8),
      amountFiatEquivalent: Number(
        (
          toNumber(withdrawal.final_amount_crypto, 8) *
          (toNumber(withdrawal.amount_fiat_equivalent, 2) / Math.max(toNumber(withdrawal.amount_crypto, 8), 0.00000001))
        ).toFixed(2)
      ),
      fromBalanceType: "pending",
      relatedWithdrawalId: withdrawal.id,
      txHash: providerExecution?.txHash ?? null,
      description: nextStatus === "completed" ? "Treasury withdrawal completed" : "Treasury withdrawal submitted to provider",
      metadata,
      status: nextStatus === "completed" ? "completed" : "pending"
    });

    return {
      withdrawalId: withdrawal.id,
      status: nextStatus,
      txHash: providerExecution?.txHash ?? null,
      providerReference: providerExecution?.providerReference ?? null
    };
  });
};

export const getMerchantTreasurySummary = async (merchantId: string) => {
  const [balances, withdrawals, transactions, feeTotals] = await Promise.all([
    query<TreasuryBalanceRow>(
      `select *
       from treasury_balances
       where owner_type = 'merchant' and owner_id = $1
       order by asset, network, balance_type`,
      [merchantId]
    ),
    query<WithdrawalRow>(
      `select *
       from treasury_withdrawals
       where owner_type = 'merchant' and owner_id = $1
       order by created_at desc
       limit 50`,
      [merchantId]
    ),
    query<QueryResultRow>(
      `select *
       from treasury_transactions
       where owner_type = 'merchant' and owner_id = $1
       order by created_at desc
       limit 100`,
      [merchantId]
    ),
    query<{ fee_type: string; amount_crypto: number | string; amount_fiat: number | string }>(
      `select fee_type,
              coalesce(sum(amount_crypto), 0)::numeric as amount_crypto,
              coalesce(sum(amount_fiat), 0)::numeric as amount_fiat
       from treasury_fees
       where (
         (owner_type = 'merchant' and owner_id = $1)
         or (
           owner_type = 'platform'
           and payment_id in (
             select id from payments where merchant_id = $1
           )
         )
       )
       group by fee_type`,
      [merchantId]
    )
  ]);

  const groupedBalances = balances.rows.reduce<Record<string, { asset: string; network: string; balances: Record<string, number> }>>(
    (acc, row) => {
      const key = `${row.asset}:${row.network}`;
      if (!acc[key]) {
        acc[key] = {
          asset: row.asset,
          network: row.network,
          balances: {
            inbound: 0,
            aggregation: 0,
            cold_vault: 0,
            withdrawable: 0,
            pending: 0
          }
        };
      }
      acc[key].balances[row.balance_type] = toNumber(row.amount_crypto, 8);
      return acc;
    },
    {}
  );

  return {
    balances: balances.rows,
    groupedBalances: Object.values(groupedBalances),
    withdrawals: withdrawals.rows,
    transactions: transactions.rows,
    feeTotals: feeTotals.rows
  };
};

export const getPlatformTreasurySummary = async () => {
  const [balances, totalFees, withdrawals, platformWallets, recentTransfers] = await Promise.all([
    query<TreasuryBalanceRow>(
      `select *
       from treasury_balances
       where owner_type = 'platform' and owner_id = 'platform'
       order by asset, network, balance_type`
    ),
    query<{ fee_type: string; total_crypto: number | string; total_fiat: number | string }>(
      `select fee_type,
              coalesce(sum(amount_crypto), 0)::numeric as total_crypto,
              coalesce(sum(amount_fiat), 0)::numeric as total_fiat
       from treasury_fees
       where owner_type = 'platform' and owner_id = 'platform'
       group by fee_type`
    ),
    query<WithdrawalRow>(
      `select *
       from treasury_withdrawals
       where status in ('pending', 'processing')
       order by created_at desc
       limit 100`
    ),
    query<QueryResultRow>(
      `select *
       from platform_treasury_wallets
       order by wallet_type, asset, network`
    ),
    query<QueryResultRow>(
      `select *
       from treasury_transactions
       where owner_type = 'platform' and owner_id = 'platform'
       order by created_at desc
       limit 50`
    )
  ]);

  return {
    balances: balances.rows,
    totalFees: totalFees.rows,
    pendingWithdrawals: withdrawals.rows,
    platformWallets: platformWallets.rows,
    recentTransfers: recentTransfers.rows
  };
};

export const processSettlement = async (
  paymentId: string,
  merchantId: string,
  asset: string,
  network: string,
  amountCrypto: number,
  amountFiat: number
) =>
  withTransaction(async (client) => {
    const pendingBalance = await getBalanceRow(client, "merchant", merchantId, asset, network, "pending");
    if (!pendingBalance || toNumber(pendingBalance.amount_crypto, 8) < amountCrypto) {
      return { status: "skipped" };
    }

    await mutateBalance(client, {
      ownerType: "merchant",
      ownerId: merchantId,
      asset,
      network,
      balanceType: "pending",
      amountCryptoDelta: -amountCrypto,
      amountFiatDelta: -amountFiat,
      requireSufficientFunds: true
    });

    await mutateBalance(client, {
      ownerType: "merchant",
      ownerId: merchantId,
      asset,
      network,
      balanceType: "withdrawable",
      amountCryptoDelta: amountCrypto,
      amountFiatDelta: amountFiat
    });

    await insertTreasuryTransaction(client, {
      ownerType: "merchant",
      ownerId: merchantId,
      asset,
      network,
      transactionType: "settlement_credited",
      amountCrypto,
      amountFiatEquivalent: amountFiat,
      fromBalanceType: "pending",
      toBalanceType: "withdrawable",
      relatedPaymentId: paymentId,
      description: "Treasury settlement released to withdrawable balance"
    });

    const settlementResult = await client.query<{ id: string }>(
      `insert into settlements (
        merchant_id, payment_id, asset, network, amount_crypto, amount_fiat, provider, tx_hash, status, processed_at, metadata
      ) values (
        $1, $2, $3, $4, $5, $6, 'treasury', coalesce((select tx_hash from payments where id = $2), ''), 'processed', now(), $7::jsonb
      )
      on conflict (payment_id) do update set
        asset = excluded.asset,
        network = excluded.network,
        amount_crypto = excluded.amount_crypto,
        amount_fiat = excluded.amount_fiat,
        provider = excluded.provider,
        status = excluded.status,
        processed_at = excluded.processed_at,
        metadata = excluded.metadata,
        updated_at = now()
      returning id`,
      [
        merchantId,
        paymentId,
        asset,
        network,
        amountCrypto,
        amountFiat,
        JSON.stringify({ settlementSource: "treasury" })
      ]
    );

    return {
      settlementId: settlementResult.rows[0].id,
      status: "processed"
    };
  });

export const approveWithdrawal = async (withdrawalId: string, approvedBy: string) => {
  const result = await query<{ id: string }>(
    `update treasury_withdrawals
     set approved_by = $2, approved_at = now(), updated_at = now()
     where id = $1 and status = 'pending'
     returning id`,
    [withdrawalId, approvedBy]
  );

  if (!result.rows[0]) {
    throw new AppError(404, "withdrawal_not_found", "Withdrawal not found or already processed");
  }

  return { withdrawalId, status: "approved" };
};

export const rejectWithdrawal = async (withdrawalId: string, rejectionReason: string, approvedBy: string) =>
  withTransaction(async (client) => {
    const withdrawalResult = await client.query<WithdrawalRow>(
      `select *
       from treasury_withdrawals
       where id = $1 and status = 'pending'
       limit 1`,
      [withdrawalId]
    );
    const withdrawal = withdrawalResult.rows[0];

    if (!withdrawal) {
      throw new AppError(404, "withdrawal_not_found", "Withdrawal not found or already processed");
    }

    await mutateBalance(client, {
      ownerType: withdrawal.owner_type,
      ownerId: withdrawal.owner_id,
      asset: withdrawal.asset,
      network: withdrawal.network,
      balanceType: "pending",
      amountCryptoDelta: -toNumber(withdrawal.amount_crypto, 8),
      amountFiatDelta: -toNumber(withdrawal.amount_fiat_equivalent, 2),
      requireSufficientFunds: true
    });

    await mutateBalance(client, {
      ownerType: withdrawal.owner_type,
      ownerId: withdrawal.owner_id,
      asset: withdrawal.asset,
      network: withdrawal.network,
      balanceType: "withdrawable",
      amountCryptoDelta: toNumber(withdrawal.amount_crypto, 8),
      amountFiatDelta: toNumber(withdrawal.amount_fiat_equivalent, 2)
    });

    await client.query(
      `update treasury_withdrawals
       set status = 'cancelled',
           rejection_reason = $2,
           approved_by = $3,
           updated_at = now()
       where id = $1`,
      [withdrawalId, rejectionReason, approvedBy]
    );

    await insertTreasuryTransaction(client, {
      ownerType: withdrawal.owner_type,
      ownerId: withdrawal.owner_id,
      asset: withdrawal.asset,
      network: withdrawal.network,
      transactionType: "withdrawal_failed",
      amountCrypto: toNumber(withdrawal.amount_crypto, 8),
      amountFiatEquivalent: toNumber(withdrawal.amount_fiat_equivalent, 2),
      fromBalanceType: "pending",
      toBalanceType: "withdrawable",
      relatedWithdrawalId: withdrawal.id,
      description: "Treasury withdrawal rejected and balance restored",
      metadata: { rejectionReason },
      status: "failed"
    });

    return { withdrawalId, status: "cancelled" };
  });

export const createTreasuryAdjustment = async (input: {
  ownerType: OwnerType;
  ownerId: string;
  asset: string;
  network: string;
  adjustmentType: "credit" | "debit";
  amountCrypto: number;
  amountFiatEquivalent: number;
  reason: string;
  performedBy: string;
}) => {
  const result = await query<{ id: string }>(
    `insert into treasury_adjustments (
      owner_type, owner_id, asset, network, adjustment_type, amount_crypto, amount_fiat_equivalent, reason, performed_by
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    returning id`,
    [
      input.ownerType,
      input.ownerId,
      input.asset,
      input.network,
      input.adjustmentType,
      input.amountCrypto,
      input.amountFiatEquivalent,
      input.reason,
      input.performedBy
    ]
  );

  return result.rows[0];
};

export const approveTreasuryAdjustment = async (adjustmentId: string, approvedBy: string) =>
  withTransaction(async (client) => {
    const adjustment = await client.query<{
      id: string;
      owner_type: OwnerType;
      owner_id: string;
      asset: string;
      network: string;
      adjustment_type: "credit" | "debit";
      amount_crypto: number | string;
      amount_fiat_equivalent: number | string;
      reason: string;
    }>(
      `select *
       from treasury_adjustments
       where id = $1 and status = 'pending'
       limit 1`,
      [adjustmentId]
    );

    const entry = adjustment.rows[0];
    if (!entry) {
      throw new AppError(404, "adjustment_not_found", "Adjustment not found or already processed");
    }

    const amountCrypto = toNumber(entry.amount_crypto, 8);
    const amountFiat = toNumber(entry.amount_fiat_equivalent, 2);
    const cryptoDelta = entry.adjustment_type === "credit" ? amountCrypto : -amountCrypto;
    const fiatDelta = entry.adjustment_type === "credit" ? amountFiat : -amountFiat;

    await mutateBalance(client, {
      ownerType: entry.owner_type,
      ownerId: entry.owner_id,
      asset: entry.asset,
      network: entry.network,
      balanceType: "withdrawable",
      amountCryptoDelta: cryptoDelta,
      amountFiatDelta: fiatDelta,
      requireSufficientFunds: entry.adjustment_type === "debit"
    });

    await client.query(
      `update treasury_adjustments
       set status = 'approved',
           approved_by = $2,
           updated_at = now()
       where id = $1`,
      [adjustmentId, approvedBy]
    );

    await insertTreasuryTransaction(client, {
      ownerType: entry.owner_type,
      ownerId: entry.owner_id,
      asset: entry.asset,
      network: entry.network,
      transactionType: entry.adjustment_type === "credit" ? "adjustment_credit" : "adjustment_debit",
      amountCrypto,
      amountFiatEquivalent: amountFiat,
      toBalanceType: "withdrawable",
      description: entry.reason,
      metadata: { adjustmentId }
    });

    return { adjustmentId, status: "approved" };
  });

export const transferTreasuryBalance = async (input: {
  asset: string;
  network: string;
  amountCrypto: number;
  amountFiatEquivalent: number;
  fromBalanceType: Extract<TreasuryBalanceType, "inbound" | "aggregation" | "cold_vault">;
  toBalanceType: Extract<TreasuryBalanceType, "inbound" | "aggregation" | "cold_vault">;
  performedBy: string;
  description?: string;
}) =>
  withTransaction(async (client) => {
    if (input.fromBalanceType === input.toBalanceType) {
      throw new AppError(400, "invalid_treasury_transfer", "Source and destination balances must differ");
    }

    await mutateBalance(client, {
      ownerType: "platform",
      ownerId: "platform",
      asset: input.asset,
      network: input.network,
      balanceType: input.fromBalanceType,
      amountCryptoDelta: -input.amountCrypto,
      amountFiatDelta: -input.amountFiatEquivalent,
      requireSufficientFunds: true
    });

    await mutateBalance(client, {
      ownerType: "platform",
      ownerId: "platform",
      asset: input.asset,
      network: input.network,
      balanceType: input.toBalanceType,
      amountCryptoDelta: input.amountCrypto,
      amountFiatDelta: input.amountFiatEquivalent
    });

    await insertTreasuryTransaction(client, {
      ownerType: "platform",
      ownerId: "platform",
      asset: input.asset,
      network: input.network,
      transactionType: input.toBalanceType === "aggregation" ? "sweep_to_aggregation" : "sweep_to_cold",
      amountCrypto: input.amountCrypto,
      amountFiatEquivalent: input.amountFiatEquivalent,
      fromBalanceType: input.fromBalanceType,
      toBalanceType: input.toBalanceType,
      description: input.description ?? `Treasury transfer ${input.fromBalanceType} -> ${input.toBalanceType}`,
      metadata: { performedBy: input.performedBy }
    });

    return { success: true };
  });

export const listWithdrawalRequests = async (ownerType?: OwnerType, ownerId?: string) => {
  let sql = `select * from treasury_withdrawals`;
  const params: unknown[] = [];
  if (ownerType && ownerId) {
    sql += ` where owner_type = $1 and owner_id = $2`;
    params.push(ownerType, ownerId);
  }
  sql += ` order by created_at desc limit 100`;
  return query<WithdrawalRow>(sql, params).then((result) => result.rows);
};

export const listTreasuryAdjustments = async (ownerType?: OwnerType, ownerId?: string) => {
  let sql = `select * from treasury_adjustments`;
  const params: unknown[] = [];
  if (ownerType && ownerId) {
    sql += ` where owner_type = $1 and owner_id = $2`;
    params.push(ownerType, ownerId);
  }
  sql += ` order by created_at desc limit 100`;
  return query<QueryResultRow>(sql, params).then((result) => result.rows);
};
