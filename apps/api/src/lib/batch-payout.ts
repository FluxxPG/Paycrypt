import { query, withTransaction } from "./db.js";
import { AppError } from "./errors.js";
import { createWithdrawalRequest, processWithdrawal } from "./treasury.js";
import { quoteCryptoAmount } from "./pricing.js";
import { nanoid } from "nanoid";

export interface BatchPayoutInput {
  merchantId: string;
  asset: "BTC" | "ETH" | "USDT";
  network: string;
  payouts: Array<{
    destinationAddress: string;
    amountCrypto: number;
    reference?: string;
  }>;
  description?: string;
}

export interface BatchPayoutRecord {
  id: string;
  merchant_id: string;
  asset: string;
  network: string;
  total_amount_crypto: number;
  total_amount_fiat: number;
  payout_count: number;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export const createBatchPayout = async (input: BatchPayoutInput) => {
  const batchId = `batch_${nanoid(16)}`;
  const payoutCount = input.payouts.length;
  const totalAmountCrypto = input.payouts.reduce((sum, p) => sum + p.amountCrypto, 0);

  // Get exchange rate for fiat equivalent
  const quote = await quoteCryptoAmount(input.asset, "USD", totalAmountCrypto);
  const totalAmountFiat = Number((totalAmountCrypto * quote.exchangeRate).toFixed(2));

  return withTransaction(async (client) => {
    // Create batch payout record
    const batchResult = await client.query<{ id: string }>(
      `insert into batch_payouts (id, merchant_id, asset, network, total_amount_crypto, total_amount_fiat, payout_count, status, description)
       values ($1, $2, $3, $4, $5, $6, $7, 'pending', $8)
       returning id`,
      [batchId, input.merchantId, input.asset, input.network, totalAmountCrypto, totalAmountFiat, payoutCount, input.description ?? null]
    );

    // Create individual payout records
    for (const payout of input.payouts) {
      const payoutId = `payout_${nanoid(16)}`;
      const amountFiat = Number((payout.amountCrypto * quote.exchangeRate).toFixed(2));

      await client.query(
        `insert into batch_payout_items (id, batch_id, merchant_id, asset, network, amount_crypto, amount_fiat, destination_address, reference, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')`,
        [payoutId, batchId, input.merchantId, input.asset, input.network, payout.amountCrypto, amountFiat, payout.destinationAddress, payout.reference ?? null]
      );
    }

    return {
      batchId,
      payoutCount,
      totalAmountCrypto,
      totalAmountFiat,
      status: "pending"
    };
  });
};

export const processBatchPayout = async (batchId: string, performedBy: string) => {
  return withTransaction(async (client) => {
    // Get batch payout record
    const batch = await client.query<BatchPayoutRecord>(
      `select * from batch_payouts where id = $1 and status = 'pending' limit 1`,
      [batchId]
    );

    if (!batch.rows[0]) {
      throw new AppError(404, "batch_not_found", "Batch payout not found or already processed");
    }

    const batchRecord = batch.rows[0];

    // Update batch status to processing
    await client.query(
      `update batch_payouts set status = 'processing', updated_at = now() where id = $1`,
      [batchId]
    );

    // Get all payout items
    const items = await client.query<{
      id: string;
      destination_address: string;
      amount_crypto: number;
    }>(
      `select id, destination_address, amount_crypto from batch_payout_items where batch_id = $1 and status = 'pending'`,
      [batchId]
    );

    let successCount = 0;
    let failureCount = 0;
    const errors: Array<{ itemId: string; error: string }> = [];

    // Process each payout
    for (const item of items.rows) {
      try {
        // Create withdrawal request
        const withdrawal = await createWithdrawalRequest("merchant", batchRecord.merchant_id, {
          asset: batchRecord.asset,
          network: batchRecord.network,
          amountCrypto: item.amount_crypto,
          destinationAddress: item.destination_address
        });

        // Process withdrawal immediately
        await processWithdrawal(withdrawal.withdrawalId, performedBy);

        // Update item status
        await client.query(
          `update batch_payout_items set status = 'completed', withdrawal_id = $2, processed_at = now() where id = $1`,
          [item.id, withdrawal.withdrawalId]
        );

        successCount++;
      } catch (error) {
        await client.query(
          `update batch_payout_items set status = 'failed', error_message = $2, processed_at = now() where id = $1`,
          [item.id, (error as Error).message]
        );
        failureCount++;
        errors.push({ itemId: item.id, error: (error as Error).message });
      }
    }

    // Update batch status
    const finalStatus = failureCount === 0 ? "completed" : successCount > 0 ? "partial" : "failed";
    await client.query(
      `update batch_payouts set status = $2, success_count = $3, failure_count = $4, updated_at = now() where id = $1`,
      [batchId, finalStatus, successCount, failureCount]
    );

    return {
      batchId,
      status: finalStatus,
      successCount,
      failureCount,
      errors
    };
  });
};

export const getBatchPayout = async (batchId: string) => {
  const batch = await query<BatchPayoutRecord>(
    `select * from batch_payouts where id = $1 limit 1`,
    [batchId]
  );

  if (!batch.rows[0]) {
    throw new AppError(404, "batch_not_found", "Batch payout not found");
  }

  const items = await query<{
    id: string;
    destination_address: string;
    amount_crypto: number;
    amount_fiat: number;
    status: string;
    reference: string | null;
    withdrawal_id: string | null;
    error_message: string | null;
    processed_at: string | null;
  }>(
    `select * from batch_payout_items where batch_id = $1 order by created_at`,
    [batchId]
  );

  return {
    batch: batch.rows[0],
    items: items.rows
  };
};

export const listBatchPayouts = async (merchantId?: string) => {
  let queryStr = `select * from batch_payouts`;
  const params: unknown[] = [];

  if (merchantId) {
    queryStr += ` where merchant_id = $1`;
    params.push(merchantId);
  }

  queryStr += ` order by created_at desc limit 100`;

  return query(queryStr, params).then((res) => res.rows);
};

export const cancelBatchPayout = async (batchId: string, performedBy: string) => {
  return withTransaction(async (client) => {
    const batch = await client.query<BatchPayoutRecord>(
      `select * from batch_payouts where id = $1 and status = 'pending' limit 1`,
      [batchId]
    );

    if (!batch.rows[0]) {
      throw new AppError(404, "batch_not_found", "Batch payout not found or already processed");
    }

    // Update batch status
    await client.query(
      `update batch_payouts set status = 'cancelled', updated_at = now() where id = $1`,
      [batchId]
    );

    // Cancel all pending items
    await client.query(
      `update batch_payout_items set status = 'cancelled', processed_at = now() where batch_id = $1 and status = 'pending'`,
      [batchId]
    );

    return { batchId, status: "cancelled" };
  });
};
