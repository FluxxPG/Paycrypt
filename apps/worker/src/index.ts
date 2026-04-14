import { config } from "dotenv";
import { Queue, QueueEvents, Worker } from "bullmq";
import Redis from "ioredis";
import { Pool } from "pg";
import { observePayment } from "./providers.js";
import { recordWorkerMetric } from "./telemetry.js";

config();

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null
});
const db = new Pool({ connectionString: process.env.DATABASE_URL });

type QueueMode = "bullmq" | "fallback";
type QueueName =
  | "payment-confirmation-checker"
  | "binance-transaction-monitor"
  | "blockchain-monitor"
  | "webhook-dispatcher"
  | "settlement-processor";
type BackoffOptions = {
  type?: "fixed" | "exponential";
  delay?: number;
};
type QueueJobOptions = {
  jobId?: string;
  delay?: number;
  attempts?: number;
  backoff?: BackoffOptions;
};
type FallbackEnvelope<T> = {
  name: string;
  data: T;
  options: QueueJobOptions;
  attemptsMade: number;
};
type WorkerLike = Pick<Worker, "close" | "on">;

const queueNames = {
  confirmations: "payment-confirmation-checker",
  binance: "binance-transaction-monitor",
  blockchain: "blockchain-monitor",
  webhooks: "webhook-dispatcher",
  settlements: "settlement-processor"
} as const;

const parseRedisVersion = (info: string) => {
  const match = info.match(/redis_version:(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return { major: 0, minor: 0, patch: 0 };
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
};

const queueModeState = { value: null as QueueMode | null, promise: null as Promise<QueueMode> | null };
const getQueueMode = async (): Promise<QueueMode> => {
  if (queueModeState.value) {
    return queueModeState.value;
  }

  if (!queueModeState.promise) {
    queueModeState.promise = (async () => {
      try {
        const info = await redis.info("server");
        const version = parseRedisVersion(info);
        if (version.major < 5) {
          return "fallback";
        }
        // BullMQ requires Lua scripting support; some Redis-compatible servers disable it.
        await redis.eval("return 1", 0);
        return "bullmq";
      } catch {
        return "fallback";
      }
    })();
  }

  queueModeState.value = await queueModeState.promise;
  return queueModeState.value;
};

const queueKey = (name: QueueName) => `queue:${name}:ready`;

const schedulePush = <T>(name: QueueName, payload: FallbackEnvelope<T>, delay = 0) => {
  if (delay > 0) {
    const timer = setTimeout(() => {
      void redis.rpush(queueKey(name), JSON.stringify(payload));
    }, delay);
    timer.unref?.();
    return;
  }

  void redis.rpush(queueKey(name), JSON.stringify(payload));
};

const fallbackDelayFor = (options: QueueJobOptions, attemptsMade: number) => {
  const baseDelay = options.backoff?.delay ?? options.delay ?? 0;
  if (options.backoff?.type === "exponential") {
    return baseDelay * Math.max(1, 2 ** Math.max(0, attemptsMade - 1));
  }
  return baseDelay;
};

const enqueueFallbackJob = async <T>(
  name: QueueName,
  jobName: string,
  data: T,
  options: QueueJobOptions = {}
) => {
  schedulePush(name, { name: jobName, data, options, attemptsMade: 0 }, options.delay ?? 0);
};

let bullmqSettlementQueue: Queue | null = null;
let activeWorkers: WorkerLike[] = [];
let activeQueueEvents: QueueEvents | null = null;
let fallbackConsumers: Promise<void>[] = [];
let stopping = false;

const enqueueSettlementJob = async (paymentId: string, merchantId: string) => {
  const mode = await getQueueMode();
  if (mode === "bullmq") {
    if (!bullmqSettlementQueue) {
      bullmqSettlementQueue = new Queue(queueNames.settlements, { connection: redis });
    }
    await bullmqSettlementQueue.add(
      "process",
      { paymentId, merchantId },
      {
        jobId: `settlement:${paymentId}`,
        attempts: 5,
        backoff: {
          type: "exponential",
          delay: 10_000
        },
        removeOnComplete: true,
        removeOnFail: false
      }
    );
    return;
  }

  await enqueueFallbackJob(
    queueNames.settlements,
    "process",
    { paymentId, merchantId },
    {
      jobId: `settlement:${paymentId}`,
      attempts: 5,
      backoff: {
        type: "exponential",
        delay: 10_000
      }
    }
  );
};

const providerForNetwork = (network: string) => {
  switch (network) {
    case "BTC":
      return "binance";
    case "ERC20":
      return "ethereum";
    case "TRC20":
      return "tron";
    default:
      return "solana";
  }
};

const loadPayment = async (paymentId: string) => {
  const result = await db.query<{
    id: string;
    merchant_id: string;
    settlement_currency: string;
    network: string;
    wallet_address: string;
    wallet_routes: Record<string, { asset: string; network: string; address: string }>;
    status: string;
    confirmations: number;
    tx_hash: string | null;
    amount_fiat: string;
    amount_crypto: string;
    expires_at: string;
  }>(
    `select
      id, merchant_id, settlement_currency, network, wallet_address, wallet_routes, status,
      confirmations, tx_hash, amount_fiat, amount_crypto, expires_at
     from payments where id = $1 limit 1`,
    [paymentId]
  );
  return result.rows[0] ?? null;
};

const updatePaymentStatus = async (
  paymentId: string,
  status: "pending" | "confirmed" | "failed" | "expired",
  confirmations: number,
  txHash: string | null,
  emitEvent = true
) => {
  const paymentResult = await db.query<{ merchant_id: string }>(
    `update payments
     set status = $2, confirmations = $3, tx_hash = coalesce($4, tx_hash), updated_at = now()
     where id = $1
     returning merchant_id`,
    [paymentId, status, confirmations, txHash]
  );

  if (!paymentResult.rows[0]) {
    return;
  }

  const paymentMetricField =
    status === "pending"
      ? "paymentPendingTotal"
      : status === "confirmed"
        ? "paymentConfirmedTotal"
        : status === "failed"
          ? "paymentFailedTotal"
          : "paymentExpiredTotal";
  void recordWorkerMetric(redis, paymentMetricField).catch((error) =>
    console.error("Failed to record payment telemetry", error)
  );

  if (!emitEvent) {
    return;
  }

  await redis.publish(
    "payments",
    JSON.stringify({
      originId: "worker",
      event: {
        type: `payment.${status}`,
        paymentId,
        merchantId: paymentResult.rows[0].merchant_id,
        status,
        confirmations,
        txHash
      }
    })
  );
};

const upsertTransaction = async (
  payment: NonNullable<Awaited<ReturnType<typeof loadPayment>>>,
  txHash: string,
  confirmations: number,
  status: "pending" | "confirmed"
) => {
  await db.query(
    `insert into transactions (
      payment_id, merchant_id, asset, network, amount_crypto, amount_fiat, tx_hash, confirmations, status, source_type
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'payment')
    on conflict (payment_id) do update set
      merchant_id = excluded.merchant_id,
      asset = excluded.asset,
      network = excluded.network,
      amount_crypto = excluded.amount_crypto,
      amount_fiat = excluded.amount_fiat,
      tx_hash = excluded.tx_hash,
      confirmations = excluded.confirmations,
      status = excluded.status`,
    [
      payment.id,
      payment.merchant_id,
      payment.settlement_currency,
      payment.network,
      payment.amount_crypto,
      payment.amount_fiat,
      txHash,
      confirmations,
      status
    ]
  );

  await db.query(
    `update wallets
     set last_seen_at = now(), is_active = true
     where merchant_id = $1 and address = $2`,
    [payment.merchant_id, payment.wallet_address]
  );
};

const retryFallbackJob = async <T>(queueName: QueueName, envelope: FallbackEnvelope<T>) => {
  const attempts = envelope.options.attempts ?? 1;
  const nextAttempt = envelope.attemptsMade + 1;
  if (nextAttempt >= attempts) {
    return false;
  }

  const delay = fallbackDelayFor(envelope.options, nextAttempt);
  const nextEnvelope: FallbackEnvelope<T> = {
    ...envelope,
    attemptsMade: nextAttempt
  };
  schedulePush(queueName, nextEnvelope, delay);
  return true;
};

const reconcilePayment = async (paymentId: string) => {
  const payment = await loadPayment(paymentId);
  if (!payment) {
    throw new Error("Payment not found");
  }

  if (["confirmed", "failed", "expired"].includes(payment.status)) {
    return;
  }

  if (new Date(payment.expires_at).getTime() <= Date.now()) {
    await updatePaymentStatus(payment.id, "expired", payment.confirmations ?? 0, payment.tx_hash, true);
    return;
  }

  const observation = await observePayment(payment);
  if (!observation) {
    const emitPending = payment.status !== "pending";
    await updatePaymentStatus(payment.id, "pending", payment.confirmations ?? 0, payment.tx_hash, emitPending);
    throw new Error("No on-chain or custodial settlement detected yet");
  }

  await upsertTransaction(payment, observation.txHash, observation.confirmations, observation.status);
  await updatePaymentStatus(
    payment.id,
    observation.status,
    observation.confirmations,
    observation.txHash,
    payment.status !== observation.status
  );

  if (observation.status === "confirmed") {
    await enqueueSettlementJob(payment.id, payment.merchant_id);
    return;
  }

  throw new Error(`Waiting for confirmations (${observation.confirmations})`);
};

const handleWebhookDispatch = async (
  payload: {
    endpointId: string;
    merchantId: string;
    eventType: string;
    payload: Record<string, unknown>;
    signature: string;
  },
  attemptNumber: number
) => {
  const endpointResult = await db.query<{
    target_url: string;
    is_active: boolean;
  }>("select target_url, is_active from webhook_endpoints where id = $1 limit 1", [payload.endpointId]);

  const endpoint = endpointResult.rows[0];
  if (!endpoint || !endpoint.is_active) {
    throw new Error("Webhook endpoint not available");
  }

  const response = await fetch(endpoint.target_url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CryptoPay-Event": payload.eventType,
      "X-CryptoPay-Signature": payload.signature
    },
    body: JSON.stringify(payload.payload)
  });

  await db.query(
    `insert into webhook_logs (merchant_id, endpoint_id, event_type, payload, response_status, attempt, delivered_at, next_retry_at)
     values ($1,$2,$3,$4::jsonb,$5,$6,case when $5 between 200 and 299 then now() else null end,case when $5 between 200 and 299 then null else now() + interval '5 minutes' end)`,
    [payload.merchantId, payload.endpointId, payload.eventType, JSON.stringify(payload.payload), response.status, attemptNumber]
  );

  void recordWorkerMetric(redis, response.ok ? "webhookDeliveredTotal" : "webhookFailedTotal").catch((error) =>
    console.error("Failed to record webhook telemetry", error)
  );

  if (!response.ok) {
    throw new Error(`Webhook dispatch failed with ${response.status}`);
  }
};

const handleSettlementJob = async (payload: { paymentId: string; merchantId: string }) => {
  try {
    const settlementResult = await db.query<{
      payment_id: string;
      merchant_id: string;
      transaction_id: string | null;
      settlement_currency: string;
      network: string;
      amount_crypto: string;
      amount_fiat: string;
      tx_hash: string | null;
      confirmations: number;
      status: string;
    }>(
      `select
        p.id as payment_id,
        p.merchant_id,
        t.id as transaction_id,
        p.settlement_currency,
        p.network,
        coalesce(t.amount_crypto, p.amount_crypto)::numeric as amount_crypto,
        coalesce(t.amount_fiat, p.amount_fiat)::numeric as amount_fiat,
        coalesce(t.tx_hash, p.tx_hash) as tx_hash,
        coalesce(t.confirmations, p.confirmations) as confirmations,
        p.status
       from payments p
       left join transactions t on t.payment_id = p.id
       where p.id = $1 and p.merchant_id = $2
       limit 1`,
      [payload.paymentId, payload.merchantId]
    );

    const settlement = settlementResult.rows[0];
    if (!settlement) {
      throw new Error("Payment not found for settlement");
    }
    if (settlement.status !== "confirmed") {
      throw new Error("Payment is not confirmed yet");
    }
    if (!settlement.tx_hash) {
      throw new Error("Missing transaction hash for settlement");
    }

    await db.query(
      `insert into settlements (
        merchant_id,
        payment_id,
        transaction_id,
        provider,
        asset,
        network,
        amount_crypto,
        amount_fiat,
        tx_hash,
        status,
        metadata,
        processed_at,
        updated_at
      ) values (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,'processed',$10::jsonb,now(),now()
      )
      on conflict (payment_id) do update set
        transaction_id = excluded.transaction_id,
        provider = excluded.provider,
        asset = excluded.asset,
        network = excluded.network,
        amount_crypto = excluded.amount_crypto,
        amount_fiat = excluded.amount_fiat,
        tx_hash = excluded.tx_hash,
        status = excluded.status,
        metadata = excluded.metadata,
        processed_at = excluded.processed_at,
        updated_at = now()`,
      [
        settlement.merchant_id,
        settlement.payment_id,
        settlement.transaction_id,
        providerForNetwork(settlement.network),
        settlement.settlement_currency,
        settlement.network,
        settlement.amount_crypto,
        settlement.amount_fiat,
        settlement.tx_hash,
        JSON.stringify({
          confirmations: settlement.confirmations,
          source: "auto_settlement"
        })
      ]
    );

    await db.query(
      `insert into audit_logs (actor_id, merchant_id, action, payload)
       values ('system', $1, 'settlement.processed', $2::jsonb)`,
      [payload.merchantId, JSON.stringify({ paymentId: payload.paymentId, status: settlement.status, txHash: settlement.tx_hash })]
    );
    void recordWorkerMetric(redis, "settlementProcessedTotal").catch((error) =>
      console.error("Failed to record settlement telemetry", error)
    );
  } catch (error) {
    void recordWorkerMetric(redis, "settlementFailedTotal").catch((telemetryError) =>
      console.error("Failed to record settlement failure telemetry", telemetryError)
    );
    throw error;
  }
};

const startBullMqWorkers = async () => {
  const confirmationWorker = new Worker(
    queueNames.confirmations,
    async (job) => reconcilePayment((job.data as { paymentId: string }).paymentId),
    {
      connection: redis
    }
  );

  const binanceWorker = new Worker(
    queueNames.binance,
    async (job) => reconcilePayment((job.data as { paymentId: string }).paymentId),
    {
      connection: redis
    }
  );

  const blockchainWorker = new Worker(
    queueNames.blockchain,
    async (job) => reconcilePayment((job.data as { paymentId: string }).paymentId),
    {
      connection: redis
    }
  );

  const webhookWorker = new Worker(
    queueNames.webhooks,
    async (job) =>
      handleWebhookDispatch(job.data as Parameters<typeof handleWebhookDispatch>[0], job.attemptsMade + 1),
    { connection: redis }
  );

  const settlementWorker = new Worker(
    queueNames.settlements,
    async (job) => handleSettlementJob(job.data as { paymentId: string; merchantId: string }),
    { connection: redis }
  );

  activeWorkers = [confirmationWorker, binanceWorker, blockchainWorker, webhookWorker, settlementWorker];
  activeQueueEvents = new QueueEvents(queueNames.confirmations, { connection: redis });

  for (const worker of activeWorkers) {
    worker.on("completed", () => {
      void recordWorkerMetric(redis, "workerJobsCompletedTotal").catch((error) =>
        console.error("Failed to record worker completion telemetry", error)
      );
    });
    worker.on("failed", () => {
      void recordWorkerMetric(redis, "workerJobsFailedTotal").catch((error) =>
        console.error("Failed to record worker failure telemetry", error)
      );
    });
  }
};

const startFallbackConsumer = async <T>(
  name: QueueName,
  handler: (payload: T, attemptsMade: number) => Promise<void>
) => {
  while (!stopping) {
    const result = await redis.blpop(queueKey(name), 1);
    if (!result) {
      continue;
    }

    let envelope: FallbackEnvelope<T>;
    try {
      envelope = JSON.parse(result[1]) as FallbackEnvelope<T>;
    } catch (error) {
      console.error(`Fallback queue ${name} received invalid payload`, error);
      continue;
    }

    try {
      await handler(envelope.data, envelope.attemptsMade);
      void recordWorkerMetric(redis, "workerJobsCompletedTotal").catch((error) =>
        console.error("Failed to record worker completion telemetry", error)
      );
    } catch (error) {
      const retried = await retryFallbackJob(name, envelope);
      if (!retried) {
        void recordWorkerMetric(redis, "workerJobsFailedTotal").catch((telemetryError) =>
          console.error("Failed to record worker failure telemetry", telemetryError)
        );
      }
      console.error(`Fallback queue ${name} job failed`, error);
    }
  }
};

const startFallbackWorkers = async () => {
  fallbackConsumers = [
    startFallbackConsumer<{ paymentId: string }>(queueNames.confirmations, async (payload) => {
      await reconcilePayment(payload.paymentId);
    }),
    startFallbackConsumer<{ paymentId: string }>(queueNames.binance, async (payload) => {
      await reconcilePayment(payload.paymentId);
    }),
    startFallbackConsumer<{ paymentId: string }>(queueNames.blockchain, async (payload) => {
      await reconcilePayment(payload.paymentId);
    }),
    startFallbackConsumer<{ endpointId: string; merchantId: string; eventType: string; payload: Record<string, unknown>; signature: string }>(
      queueNames.webhooks,
      async (payload, attemptsMade) => {
        await handleWebhookDispatch(payload, attemptsMade + 1);
      }
    ),
    startFallbackConsumer<{ paymentId: string; merchantId: string }>(queueNames.settlements, async (payload) => {
      await handleSettlementJob(payload);
    })
  ];
};

const bootstrap = async () => {
  const mode = await getQueueMode();
  if (mode === "bullmq") {
    await startBullMqWorkers();
    console.log("Worker cluster started in BullMQ mode");
    return;
  }

  await startFallbackWorkers();
  console.warn("Worker cluster started in fallback Redis-list mode because Redis lacks BullMQ requirements (version or Lua)");
};

const shutdown = async (signal: string) => {
  console.log(`${signal} received, closing worker cluster`);
  stopping = true;
  for (const worker of activeWorkers) {
    await worker.close().catch((error) => {
      console.error("Failed to close worker", error);
    });
  }
  if (activeQueueEvents) {
    await activeQueueEvents.close().catch((error) => {
      console.error("Failed to close queue events", error);
    });
  }
  if (bullmqSettlementQueue) {
    await bullmqSettlementQueue.close().catch((error) => {
      console.error("Failed to close settlement queue", error);
    });
  }
  await Promise.allSettled(fallbackConsumers);
  await db.end().catch((error) => {
    console.error("Failed to close database pool", error);
  });
  await redis.quit().catch((error) => {
    console.error("Failed to close redis connection", error);
  });
  process.exit(0);
};

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

void bootstrap().catch((error) => {
  console.error("Failed to start worker cluster", error);
  process.exitCode = 1;
});
