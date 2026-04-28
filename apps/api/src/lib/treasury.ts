import { query, withTransaction } from "./db.js";
import { AppError } from "./errors.js";
import { quoteCryptoAmount } from "./pricing.js";

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

export const getTreasuryBalance = async (
  ownerType: "platform" | "merchant",
  ownerId: string,
  asset: string,
  network: string,
  balanceType: TreasuryBalanceType
) => {
  const result = await query<{
    id: string;
    amount_crypto: number;
    amount_fiat_equivalent: number;
  }>(
    `select id, amount_crypto, amount_fiat_equivalent
     from treasury_balances
     where owner_type = $1 and owner_id = $2 and asset = $3 and network = $4 and balance_type = $5
     limit 1`,
    [ownerType, ownerId, asset, network, balanceType]
  );
  return result.rows[0] ?? null;
};

export const updateTreasuryBalance = async (
  ownerType: "platform" | "merchant",
  ownerId: string,
  asset: string,
  network: string,
  balanceType: TreasuryBalanceType,
  amountDelta: number,
  fiatEquivalent: number
) => {
  return withTransaction(async (client) => {
    const existing = await client.query<{
      id: string;
      amount_crypto: number;
    }>(
      `select id, amount_crypto
       from treasury_balances
       where owner_type = $1 and owner_id = $2 and asset = $3 and network = $4 and balance_type = $5
       limit 1`,
      [ownerType, ownerId, asset, network, balanceType]
    );

    if (existing.rows[0]) {
      const newAmount = Number(existing.rows[0].amount_crypto) + amountDelta;
      await client.query(
        `update treasury_balances
         set amount_crypto = $3, amount_fiat_equivalent = amount_fiat_equivalent + $4, last_updated_at = now()
         where id = $1`,
        [existing.rows[0].id, newAmount, fiatEquivalent]
      );
    } else {
      await client.query(
        `insert into treasury_balances (owner_type, owner_id, asset, network, balance_type, amount_crypto, amount_fiat_equivalent)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [ownerType, ownerId, asset, network, balanceType, amountDelta, fiatEquivalent]
      );
    }
  });
};

export const recordTreasuryTransaction = async (input: {
  ownerType: "platform" | "merchant";
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
  txHash?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}) => {
  await query(
    `insert into treasury_transactions (
      owner_type, owner_id, asset, network, transaction_type, amount_crypto, amount_fiat_equivalent,
      from_balance_type, to_balance_type, related_payment_id, related_withdrawal_id, related_settlement_id,
      tx_hash, description, metadata
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)`,
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
      JSON.stringify(input.metadata ?? {})
    ]
  );
};

export const recordFeeDeduction = async (input: {
  ownerType: "platform" | "merchant";
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
}) => {
  await query(
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
    // Record fee deduction
    await client.query(
      `insert into treasury_fees (
        owner_type, owner_id, payment_id, asset, network, fee_percent, amount_crypto,
        amount_fiat, exchange_rate, fee_type, description
      ) values ('platform', 'platform', $1, $2, $3, $4, $5, $6, $7, 'platform', 'Platform fee deduction')`,
      [paymentId, asset, network, feePercent, feeAmountCrypto, feeAmountFiat, exchangeRate]
    );

    // Credit platform treasury
    const platformBalance = await client.query<{
      id: string;
      amount_crypto: number;
    }>(
      `select id, amount_crypto
       from treasury_balances
       where owner_type = 'platform' and owner_id = 'platform' and asset = $1 and network = $2 and balance_type = 'inbound'
       limit 1`,
      [asset, network]
    );

    if (platformBalance.rows[0]) {
      await client.query(
        `update treasury_balances
         set amount_crypto = amount_crypto + $3, amount_fiat_equivalent = amount_fiat_equivalent + $4, last_updated_at = now()
         where id = $1`,
        [platformBalance.rows[0].id, feeAmountCrypto, feeAmountFiat]
      );
    } else {
      await client.query(
        `insert into treasury_balances (owner_type, owner_id, asset, network, balance_type, amount_crypto, amount_fiat_equivalent)
         values ('platform', 'platform', $1, $2, 'inbound', $3, $4)`,
        [asset, network, feeAmountCrypto, feeAmountFiat]
      );
    }

    // Record platform transaction
    await client.query(
      `insert into treasury_transactions (
        owner_type, owner_id, asset, network, transaction_type, amount_crypto, amount_fiat_equivalent,
        to_balance_type, related_payment_id, description, metadata
      ) values ('platform', 'platform', $1, $2, 'fee_deducted', $3, $4, 'inbound', $5, 'Platform fee from payment', $6::jsonb)`,
      [asset, network, feeAmountCrypto, feeAmountFiat, paymentId, JSON.stringify({ merchantId, feePercent })]
    );

    // Credit merchant pending balance (net amount)
    const merchantBalance = await client.query<{
      id: string;
      amount_crypto: number;
    }>(
      `select id, amount_crypto
       from treasury_balances
       where owner_type = 'merchant' and owner_id = $1 and asset = $2 and network = $3 and balance_type = 'pending'
       limit 1`,
      [merchantId, asset, network]
    );

    if (merchantBalance.rows[0]) {
      await client.query(
        `update treasury_balances
         set amount_crypto = amount_crypto + $3, amount_fiat_equivalent = amount_fiat_equivalent + $4, last_updated_at = now()
         where id = $1`,
        [merchantBalance.rows[0].id, netAmountCrypto, netAmountFiat]
      );
    } else {
      await client.query(
        `insert into treasury_balances (owner_type, owner_id, asset, network, balance_type, amount_crypto, amount_fiat_equivalent)
         values ('merchant', $1, $2, $3, 'pending', $4, $5)`,
        [merchantId, asset, network, netAmountCrypto, netAmountFiat]
      );
    }

    // Record merchant transaction
    await client.query(
      `insert into treasury_transactions (
        owner_type, owner_id, asset, network, transaction_type, amount_crypto, amount_fiat_equivalent,
        to_balance_type, related_payment_id, description, metadata
      ) values ('merchant', $1, $2, $3, 'payment_received', $4, $5, 'pending', $6, 'Payment received (net of fees)', $7::jsonb)`,
      [merchantId, asset, network, netAmountCrypto, netAmountFiat, paymentId, JSON.stringify({ feePercent, feeAmountCrypto })]
    );

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
    min_withdrawal_amount_fiat: number;
    min_withdrawal_penalty_fiat: number;
    min_withdrawal_penalty_crypto: number;
    gas_fee_fixed_crypto: number;
    gas_fee_fixed_fiat: number;
    gas_fee_percent: number;
  }>(
    `select min_withdrawal_amount_fiat, min_withdrawal_penalty_fiat, min_withdrawal_penalty_crypto,
            gas_fee_fixed_crypto, gas_fee_fixed_fiat, gas_fee_percent
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

  let penaltyFeeCrypto = 0;
  let penaltyFeeFiat = 0;
  let gasFeeCrypto = config.gas_fee_fixed_crypto;
  let gasFeeFiat = config.gas_fee_fixed_fiat;

  // Apply penalty if below minimum
  if (amountFiat < config.min_withdrawal_amount_fiat) {
    if (config.min_withdrawal_penalty_crypto > 0) {
      penaltyFeeCrypto = config.min_withdrawal_penalty_crypto;
      penaltyFeeFiat = Number((penaltyFeeCrypto * (amountFiat / amountCrypto)).toFixed(2));
    } else {
      penaltyFeeFiat = config.min_withdrawal_penalty_fiat;
      penaltyFeeCrypto = Number((penaltyFeeFiat * (amountCrypto / amountFiat)).toFixed(8));
    }
  }

  // Apply percentage-based gas fee if configured
  if (config.gas_fee_percent > 0) {
    const percentGasFeeFiat = Number((amountFiat * (config.gas_fee_percent / 100)).toFixed(2));
    const percentGasFeeCrypto = Number((amountCrypto * (config.gas_fee_percent / 100)).toFixed(8));
    gasFeeFiat += percentGasFeeFiat;
    gasFeeCrypto += percentGasFeeCrypto;
  }

  const totalDeductionCrypto = Number((penaltyFeeCrypto + gasFeeCrypto).toFixed(8));
  const totalDeductionFiat = Number((penaltyFeeFiat + gasFeeFiat).toFixed(2));
  const finalAmountCrypto = Number((amountCrypto - totalDeductionCrypto).toFixed(8));
  const finalAmountFiat = Number((amountFiat - totalDeductionFiat).toFixed(2));

  return {
    penaltyFeeCrypto,
    penaltyFeeFiat,
    gasFeeCrypto,
    gasFeeFiat,
    totalDeductionCrypto,
    totalDeductionFiat,
    finalAmountCrypto,
    finalAmountFiat,
    config
  };
};

export const createWithdrawalRequest = async (
  ownerType: "platform" | "merchant",
  ownerId: string,
  input: {
    asset: string;
    network: string;
    amountCrypto: number;
    destinationAddress: string;
    destinationWalletProvider?: string;
  }
) => {
  const balance = await getTreasuryBalance(ownerType, ownerId, input.asset, input.network, "withdrawable");
  if (!balance || Number(balance.amount_crypto) < input.amountCrypto) {
    throw new AppError(400, "insufficient_balance", "Insufficient withdrawable balance");
  }

  const quote = await quoteCryptoAmount(input.asset, "USD", input.amountCrypto);
  const amountFiat = Number((input.amountCrypto * quote.exchangeRate).toFixed(2));
  const fees = await calculateWithdrawalFees(input.asset, input.network, input.amountCrypto, amountFiat);

  if (fees.finalAmountCrypto <= 0) {
    throw new AppError(400, "invalid_withdrawal_amount", "Withdrawal amount after fees is too low");
  }

  return withTransaction(async (client) => {
    // Create withdrawal record
    const result = await client.query<{ id: string }>(
      `insert into treasury_withdrawals (
        owner_type, owner_id, asset, network, amount_crypto, amount_fiat_equivalent,
        destination_address, destination_wallet_provider, gas_fee_crypto, gas_fee_fiat,
        penalty_fee_crypto, penalty_fee_fiat, final_amount_crypto, status
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
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
        fees.finalAmountCrypto
      ]
    );

    const withdrawalId = result.rows[0].id;

    // Deduct from withdrawable balance
    await client.query(
      `update treasury_balances
       set amount_crypto = amount_crypto - $3, amount_fiat_equivalent = amount_fiat_equivalent - $4, last_updated_at = now()
       where owner_type = $1 and owner_id = $2 and asset = $3 and network = $4 and balance_type = 'withdrawable'`,
      [ownerType, ownerId, input.asset, input.network, input.amountCrypto, amountFiat]
    );

    // Add to pending balance
    const pendingBalance = await client.query<{ id: string }>(
      `select id from treasury_balances
       where owner_type = $1 and owner_id = $2 and asset = $3 and network = $4 and balance_type = 'pending'
       limit 1`,
      [ownerType, ownerId, input.asset, input.network]
    );

    if (pendingBalance.rows[0]) {
      await client.query(
        `update treasury_balances
         set amount_crypto = amount_crypto + $3, amount_fiat_equivalent = amount_fiat_equivalent + $4, last_updated_at = now()
         where id = $1`,
        [pendingBalance.rows[0].id, input.amountCrypto, amountFiat]
      );
    } else {
      await client.query(
        `insert into treasury_balances (owner_type, owner_id, asset, network, balance_type, amount_crypto, amount_fiat_equivalent)
         values ($1, $2, $3, $4, 'pending', $5, $6)`,
        [ownerType, ownerId, input.asset, input.network, input.amountCrypto, amountFiat]
      );
    }

    // Record transaction
    await client.query(
      `insert into treasury_transactions (
        owner_type, owner_id, asset, network, transaction_type, amount_crypto, amount_fiat_equivalent,
        from_balance_type, to_balance_type, related_withdrawal_id, description, metadata
      ) values ($1, $2, $3, $4, 'withdrawal_requested', $5, $6, 'withdrawable', 'pending', $7, 'Withdrawal requested', $8::jsonb)`,
      [
        ownerType,
        ownerId,
        input.asset,
        input.network,
        input.amountCrypto,
        amountFiat,
        withdrawalId,
        JSON.stringify({ destinationAddress: input.destinationAddress, fees })
      ]
    );

    return {
      withdrawalId,
      fees
    };
  });
};

export const processWithdrawal = async (withdrawalId: string, performedBy: string) => {
  return withTransaction(async (client) => {
    const withdrawal = await client.query<{
      id: string;
      owner_type: string;
      owner_id: string;
      asset: string;
      network: string;
      amount_crypto: number;
      amount_fiat_equivalent: number;
      final_amount_crypto: number;
      destination_address: string;
      destination_wallet_provider: string | null;
      gas_fee_crypto: number;
      gas_fee_fiat: number;
      penalty_fee_crypto: number;
      penalty_fee_fiat: number;
    }>(
      `select * from treasury_withdrawals where id = $1 and status = 'pending' limit 1`,
      [withdrawalId]
    );

    if (!withdrawal.rows[0]) {
      throw new AppError(404, "withdrawal_not_found", "Withdrawal not found or already processed");
    }

    const w = withdrawal.rows[0];

    // Update status to processing
    await client.query(
      `update treasury_withdrawals set status = 'processing', processed_by = $2 where id = $1`,
      [withdrawalId, performedBy]
    );

    // TODO: Execute actual blockchain withdrawal here
    // For now, simulate success
    const txHash = `0x${Math.random().toString(16).slice(2)}`;

    // Deduct from pending balance
    await client.query(
      `update treasury_balances
       set amount_crypto = amount_crypto - $3, amount_fiat_equivalent = amount_fiat_equivalent - $4, last_updated_at = now()
       where owner_type = $1 and owner_id = $2 and asset = $3 and network = $4 and balance_type = 'pending'`,
      [w.owner_type, w.owner_id, w.asset, w.network, w.amount_crypto, w.amount_fiat_equivalent]
    );

    // Record gas fee deduction
    if (w.gas_fee_crypto > 0) {
      await client.query(
        `insert into treasury_fees (
          owner_type, owner_id, payment_id, asset, network, fee_percent, amount_crypto,
          amount_fiat, exchange_rate, fee_type, description
        ) values ($1, $2, $3, $4, $5, 0, $6, $7, 1, 'gas', 'Gas fee for withdrawal')`,
        [w.owner_type, w.owner_id, withdrawalId, w.asset, w.network, w.gas_fee_crypto, w.gas_fee_fiat]
      );
    }

    // Record penalty fee deduction
    if (w.penalty_fee_crypto > 0) {
      await client.query(
        `insert into treasury_fees (
          owner_type, owner_id, payment_id, asset, network, fee_percent, amount_crypto,
          amount_fiat, exchange_rate, fee_type, description
        ) values ($1, $2, $3, $4, $5, 0, $6, $7, 1, 'withdrawal_penalty', 'Early withdrawal penalty')`,
        [w.owner_type, w.owner_id, withdrawalId, w.asset, w.network, w.penalty_fee_crypto, w.penalty_fee_fiat]
      );
    }

    // Update withdrawal as completed
    await client.query(
      `update treasury_withdrawals
       set status = 'completed', tx_hash = $3, processed_at = now(), processed_by = $4
       where id = $1`,
      [withdrawalId, txHash, performedBy]
    );

    // Record transaction
    await client.query(
      `insert into treasury_transactions (
        owner_type, owner_id, asset, network, transaction_type, amount_crypto, amount_fiat_equivalent,
        from_balance_type, related_withdrawal_id, tx_hash, description, metadata
      ) values ($1, $2, $3, $4, 'withdrawal_processed', $5, $6, 'pending', $7, $8, 'Withdrawal processed', $9::jsonb)`,
      [
        w.owner_type,
        w.owner_id,
        w.asset,
        w.network,
        w.final_amount_crypto,
        Number((w.final_amount_crypto * (w.amount_fiat_equivalent / w.amount_crypto)).toFixed(2)),
        withdrawalId,
        txHash,
        JSON.stringify({ destinationAddress: w.destination_address })
      ]
    );

    return {
      withdrawalId,
      txHash,
      status: "completed"
    };
  });
};

export const getMerchantTreasurySummary = async (merchantId: string) => {
  const balances = await query<{
    balance_type: string;
    asset: string;
    network: string;
    amount_crypto: number;
    amount_fiat_equivalent: number;
  }>(
    `select balance_type, asset, network, amount_crypto, amount_fiat_equivalent
     from treasury_balances
     where owner_type = 'merchant' and owner_id = $1
     order by asset, network, balance_type`,
    [merchantId]
  );

  const withdrawals = await query<{
    id: string;
    asset: string;
    network: string;
    amount_crypto: number;
    amount_fiat_equivalent: number;
    final_amount_crypto: number;
    status: string;
    created_at: string;
  }>(
    `select id, asset, network, amount_crypto, amount_fiat_equivalent, final_amount_crypto, status, created_at
     from treasury_withdrawals
     where owner_type = 'merchant' and owner_id = $1
     order by created_at desc
     limit 20`,
    [merchantId]
  );

  const transactions = await query<{
    transaction_type: string;
    amount_crypto: number;
    amount_fiat_equivalent: number;
    created_at: string;
    description: string;
  }>(
    `select transaction_type, amount_crypto, amount_fiat_equivalent, created_at, description
     from treasury_transactions
     where owner_type = 'merchant' and owner_id = $1
     order by created_at desc
     limit 50`,
    [merchantId]
  );

  return {
    balances: balances.rows,
    withdrawals: withdrawals.rows,
    transactions: transactions.rows
  };
};

export const getPlatformTreasurySummary = async () => {
  const balances = await query<{
    balance_type: string;
    asset: string;
    network: string;
    amount_crypto: number;
    amount_fiat_equivalent: number;
  }>(
    `select balance_type, asset, network, amount_crypto, amount_fiat_equivalent
     from treasury_balances
     where owner_type = 'platform' and owner_id = 'platform'
     order by asset, network, balance_type`
  );

  const totalFees = await query<{
    total_crypto: number;
    total_fiat: number;
  }>(
    `select sum(amount_crypto)::numeric(24,8) as total_crypto, sum(amount_fiat)::numeric(18,2) as total_fiat
     from treasury_fees
     where owner_type = 'platform' and owner_id = 'platform'`
  );

  const withdrawals = await query<{
    id: string;
    owner_type: string;
    owner_id: string;
    asset: string;
    amount_crypto: number;
    status: string;
    created_at: string;
  }>(
    `select id, owner_type, owner_id, asset, amount_crypto, status, created_at
     from treasury_withdrawals
     where status in ('pending', 'processing')
     order by created_at desc
     limit 50`
  );

  return {
    balances: balances.rows,
    totalFees: totalFees.rows[0] ?? { total_crypto: 0, total_fiat: 0 },
    pendingWithdrawals: withdrawals.rows
  };
};

export const processSettlement = async (
  paymentId: string,
  merchantId: string,
  asset: string,
  network: string,
  amountCrypto: number,
  amountFiat: number
) => {
  return withTransaction(async (client) => {
    // Move from pending to withdrawable balance
    const pendingBalance = await client.query<{
      id: string;
      amount_crypto: number;
    }>(
      `select id, amount_crypto
       from treasury_balances
       where owner_type = 'merchant' and owner_id = $1 and asset = $2 and network = $3 and balance_type = 'pending'
       limit 1`,
      [merchantId, asset, network]
    );

    if (pendingBalance.rows[0] && Number(pendingBalance.rows[0].amount_crypto) >= amountCrypto) {
      await client.query(
        `update treasury_balances
         set amount_crypto = amount_crypto - $3, amount_fiat_equivalent = amount_fiat_equivalent - $4, last_updated_at = now()
         where id = $1`,
        [pendingBalance.rows[0].id, amountCrypto, amountFiat]
      );

      const withdrawableBalance = await client.query<{ id: string }>(
        `select id from treasury_balances
         where owner_type = 'merchant' and owner_id = $1 and asset = $2 and network = $3 and balance_type = 'withdrawable'
         limit 1`,
        [merchantId, asset, network]
      );

      if (withdrawableBalance.rows[0]) {
        await client.query(
          `update treasury_balances
           set amount_crypto = amount_crypto + $3, amount_fiat_equivalent = amount_fiat_equivalent + $4, last_updated_at = now()
           where id = $1`,
          [withdrawableBalance.rows[0].id, amountCrypto, amountFiat]
        );
      } else {
        await client.query(
          `insert into treasury_balances (owner_type, owner_id, asset, network, balance_type, amount_crypto, amount_fiat_equivalent)
           values ('merchant', $1, $2, $3, 'withdrawable', $4, $5)`,
          [merchantId, asset, network, amountCrypto, amountFiat]
        );
      }

      // Record settlement transaction
      await client.query(
        `insert into treasury_transactions (
          owner_type, owner_id, asset, network, transaction_type, amount_crypto, amount_fiat_equivalent,
          from_balance_type, to_balance_type, related_payment_id, description
        ) values ('merchant', $1, $2, $3, 'settlement_credited', $4, $5, 'pending', 'withdrawable', $6, 'Settlement processed')`,
        [merchantId, asset, network, amountCrypto, amountFiat, paymentId]
      );

      // Create settlement record
      const settlementResult = await client.query<{ id: string }>(
        `insert into settlements (merchant_id, payment_id, asset, network, amount_crypto, amount_fiat, provider, status)
         values ($1, $2, $3, $4, $5, $6, 'treasury', 'processed')
         returning id`,
        [merchantId, paymentId, asset, network, amountCrypto, amountFiat]
      );

      return {
        settlementId: settlementResult.rows[0].id,
        status: "processed"
      };
    }

    return {
      status: "skipped"
    };
  });
};

export const approveWithdrawal = async (withdrawalId: string, approvedBy: string) => {
  const result = await query(
    `update treasury_withdrawals
     set status = 'processing', approved_by = $2, approved_at = now()
     where id = $1 and status = 'pending'
     returning id`,
    [withdrawalId, approvedBy]
  );

  if (!result.rows[0]) {
    throw new AppError(404, "withdrawal_not_found", "Withdrawal not found or already processed");
  }

  return result.rows[0];
};

export const rejectWithdrawal = async (withdrawalId: string, rejectionReason: string, approvedBy: string) => {
  return withTransaction(async (client) => {
    const withdrawal = await client.query<{
      id: string;
      owner_type: string;
      owner_id: string;
      asset: string;
      network: string;
      amount_crypto: number;
      amount_fiat_equivalent: number;
    }>(
      `select * from treasury_withdrawals where id = $1 and status = 'pending' limit 1`,
      [withdrawalId]
    );

    if (!withdrawal.rows[0]) {
      throw new AppError(404, "withdrawal_not_found", "Withdrawal not found or already processed");
    }

    const w = withdrawal.rows[0];

    await client.query(
      `update treasury_withdrawals
       set status = 'cancelled', rejection_reason = $2, approved_by = $3
       where id = $1`,
      [withdrawalId, rejectionReason, approvedBy]
    );

    // Refund to withdrawable balance
    await client.query(
      `update treasury_balances
       set amount_crypto = amount_crypto + $3, amount_fiat_equivalent = amount_fiat_equivalent + $4, last_updated_at = now()
       where owner_type = $1 and owner_id = $2 and asset = $3 and network = $4 and balance_type = 'withdrawable'`,
      [w.owner_type, w.owner_id, w.asset, w.network, w.amount_crypto, w.amount_fiat_equivalent]
    );

    // Deduct from pending balance
    await client.query(
      `update treasury_balances
       set amount_crypto = amount_crypto - $3, amount_fiat_equivalent = amount_fiat_equivalent - $4, last_updated_at = now()
       where owner_type = $1 and owner_id = $2 and asset = $3 and network = $4 and balance_type = 'pending'`,
      [w.owner_type, w.owner_id, w.asset, w.network, w.amount_crypto, w.amount_fiat_equivalent]
    );

    // Record transaction
    await client.query(
      `insert into treasury_transactions (
        owner_type, owner_id, asset, network, transaction_type, amount_crypto, amount_fiat_equivalent,
        to_balance_type, from_balance_type, related_withdrawal_id, description
      ) values ($1, $2, $3, $4, 'withdrawal_failed', $5, $6, 'withdrawable', 'pending', $7, 'Withdrawal rejected')`,
      [w.owner_type, w.owner_id, w.asset, w.network, w.amount_crypto, w.amount_fiat_equivalent, withdrawalId]
    );

    return { withdrawalId, status: "cancelled" };
  });
};

export const createTreasuryAdjustment = async (input: {
  ownerType: "platform" | "merchant";
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

export const approveTreasuryAdjustment = async (adjustmentId: string, approvedBy: string) => {
  return withTransaction(async (client) => {
    const adjustment = await client.query<{
      id: string;
      owner_type: string;
      owner_id: string;
      asset: string;
      network: string;
      adjustment_type: string;
      amount_crypto: number;
      amount_fiat_equivalent: number;
      reason: string;
    }>(
      `select * from treasury_adjustments where id = $1 and status = 'pending' limit 1`,
      [adjustmentId]
    );

    if (!adjustment.rows[0]) {
      throw new AppError(404, "adjustment_not_found", "Adjustment not found or already processed");
    }

    const adj = adjustment.rows[0];

    await client.query(
      `update treasury_adjustments set status = 'approved', approved_by = $2 where id = $1`,
      [adjustmentId, approvedBy]
    );

    const balanceType = "withdrawable";
    const amountDelta = adj.adjustment_type === "credit" ? adj.amount_crypto : -adj.amount_crypto;
    const fiatDelta = adj.adjustment_type === "credit" ? adj.amount_fiat_equivalent : -adj.amount_fiat_equivalent;

    const balance = await client.query<{ id: string }>(
      `select id from treasury_balances
       where owner_type = $1 and owner_id = $2 and asset = $3 and network = $4 and balance_type = $5
       limit 1`,
      [adj.owner_type, adj.owner_id, adj.asset, adj.network, balanceType]
    );

    if (balance.rows[0]) {
      await client.query(
        `update treasury_balances
         set amount_crypto = amount_crypto + $3, amount_fiat_equivalent = amount_fiat_equivalent + $4, last_updated_at = now()
         where id = $1`,
        [balance.rows[0].id, amountDelta, fiatDelta]
      );
    } else {
      await client.query(
        `insert into treasury_balances (owner_type, owner_id, asset, network, balance_type, amount_crypto, amount_fiat_equivalent)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [adj.owner_type, adj.owner_id, adj.asset, adj.network, balanceType, amountDelta, fiatDelta]
      );
    }

    const transactionType = adj.adjustment_type === "credit" ? "adjustment_credit" : "adjustment_debit";
    await client.query(
      `insert into treasury_transactions (
        owner_type, owner_id, asset, network, transaction_type, amount_crypto, amount_fiat_equivalent,
        to_balance_type, description, metadata
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [adj.owner_type, adj.owner_id, adj.asset, adj.network, transactionType, adj.amount_crypto, adj.amount_fiat_equivalent, balanceType, adj.reason, JSON.stringify({ adjustmentId })]
    );

    return { adjustmentId, status: "approved" };
  });
};

export const listWithdrawalRequests = async (ownerType?: "platform" | "merchant", ownerId?: string) => {
  let queryStr = `select * from treasury_withdrawals`;
  const params: unknown[] = [];

  if (ownerType && ownerId) {
    queryStr += ` where owner_type = $1 and owner_id = $2`;
    params.push(ownerType, ownerId);
  }

  queryStr += ` order by created_at desc limit 100`;

  return query(queryStr, params).then((res) => res.rows);
};

export const listTreasuryAdjustments = async (ownerType?: "platform" | "merchant", ownerId?: string) => {
  let queryStr = `select * from treasury_adjustments`;
  const params: unknown[] = [];

  if (ownerType && ownerId) {
    queryStr += ` where owner_type = $1 and owner_id = $2`;
    params.push(ownerType, ownerId);
  }

  queryStr += ` order by created_at desc limit 100`;

  return query(queryStr, params).then((res) => res.rows);
};
