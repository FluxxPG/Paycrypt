import { query, withTransaction } from "./db.js";
import { AppError } from "./errors.js";
import { quoteCryptoAmount } from "./pricing.js";
import { queues } from "./queue.js";

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
  id: string; // UUID as string
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
  const payoutCount = input.payouts.length;
  const totalAmountCrypto = input.payouts.reduce((sum, p) => sum + p.amountCrypto, 0);

  // Get exchange rate for fiat equivalent
  const quote = await quoteCryptoAmount(input.asset, "USD", totalAmountCrypto);
  const totalAmountFiat = Number((totalAmountCrypto * quote.exchangeRate).toFixed(2));

  return withTransaction(async (client) => {
    // Create batch payout record
    const batchResult = await client.query<{ id: string }>(
      `insert into batch_payouts (merchant_id, asset, network, total_amount_crypto, total_amount_fiat, payout_count, description)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        input.merchantId,
        input.asset,
        input.network,
        input.payouts.reduce((sum, p) => sum + p.amountCrypto, 0),
        totalAmountFiat,
        input.payouts.length,
        input.description ?? null
      ]
    );

    const batchId = batchResult.rows[0].id;

    // Create individual payout records
    for (const payout of input.payouts) {
      const amountFiat = Number((payout.amountCrypto * quote.exchangeRate).toFixed(2));

      await client.query(
        `insert into batch_payout_items (batch_id, merchant_id, asset, network, amount_crypto, amount_fiat, destination_address, reference, status)
         values ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
        [batchId, input.merchantId, input.asset, input.network, payout.amountCrypto, amountFiat, payout.destinationAddress, payout.reference ?? null]
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
  const queued = await withTransaction(async (client) => {
    const batch = await client.query<BatchPayoutRecord>(
      `select * from batch_payouts where id = $1 and status = 'pending' limit 1`,
      [batchId]
    );

    if (!batch.rows[0]) {
      throw new AppError(404, "batch_not_found", "Batch payout not found or already processed");
    }

    const batchRecord = batch.rows[0];

    await client.query(
      `update batch_payouts
       set status = 'processing',
           performed_by = $2,
           updated_at = now()
       where id = $1`,
      [batchId, performedBy]
    );

    return {
      batchId,
      status: "processing",
      payoutCount: batchRecord.payout_count
    };
  });

  await queues.batchPayouts.add(
    "process",
    { batchId, performedBy },
    {
      jobId: `batch-payout:${batchId}`,
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 30_000
      },
      removeOnComplete: true,
      removeOnFail: false
    }
  );

  return queued;
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
