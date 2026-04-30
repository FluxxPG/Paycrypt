import { config } from "dotenv";
import { existsSync } from "node:fs";
import crypto from "node:crypto";
import dns from "node:dns";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Queue, QueueEvents, Worker } from "bullmq";
import Redis from "ioredis";
import { Pool, type PoolClient } from "pg";
import { observePayment, requiredConfirmations } from "./providers.js";
import { recordWorkerMetric } from "./telemetry.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const repoRoot = path.resolve(currentDir, "../../../");
const loadEnvFile = (envPath: string, override: boolean) => {
  if (existsSync(envPath)) {
    config({ path: envPath, override });
  }
};

loadEnvFile(path.join(repoRoot, ".env"), false);
loadEnvFile(path.join(process.cwd(), ".env"), false);
loadEnvFile(path.join(repoRoot, ".env.local"), true);
loadEnvFile(path.join(process.cwd(), ".env.local"), true);
const originalLookup = dns.lookup.bind(dns);
dns.lookup = ((hostname, options, callback) => {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  const normalized = typeof options === "number" ? { family: options } : { ...(options ?? {}) };
  if (typeof hostname === "string" && hostname.includes(".supabase.co")) {
    normalized.family = 4;
  }

  return originalLookup(hostname, normalized as never, callback as never);
}) as typeof dns.lookup;

const parseClusterNodes = (value: string) =>
  value
    .split(",")
    .map((node) => node.trim())
    .filter(Boolean)
    .map((node) => {
      const [host, port] = node.split(":");
      return { host, port: port ? Number(port) : 6379 };
    });

const redisClusterNodes = process.env.REDIS_CLUSTER_NODES;
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const redis = redisClusterNodes
  ? new Redis.Cluster(parseClusterNodes(redisClusterNodes), {
      scaleReads: "slave",
      redisOptions: { maxRetriesPerRequest: null }
    })
  : new Redis(redisUrl, {
      maxRetriesPerRequest: null
    });
const needsSsl =
  (process.env.DATABASE_URL ?? "").includes(".supabase.co") ||
  (process.env.DATABASE_URL ?? "").includes("sslmode=");

const poolConfig = {
  max: process.env.PGPOOL_MAX ? Number(process.env.PGPOOL_MAX) : 50,
  min: process.env.PGPOOL_MIN ? Number(process.env.PGPOOL_MIN) : 0,
  idleTimeoutMillis: process.env.PGPOOL_IDLE_TIMEOUT_MS ? Number(process.env.PGPOOL_IDLE_TIMEOUT_MS) : 30_000,
  connectionTimeoutMillis: process.env.PGPOOL_CONN_TIMEOUT_MS ? Number(process.env.PGPOOL_CONN_TIMEOUT_MS) : 2_000
};
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...poolConfig,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {})
});
const workerName = process.env.WORKER_NAME ?? "cryptopay-worker";
const binanceBaseUrl = process.env.BINANCE_BASE_URL ?? "https://api.binance.com";

const workerPort = Number(process.env.WORKER_PORT ?? 4002);
const healthServer = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "worker" }));
    return;
  }

  if (req.method === "GET" && req.url === "/ready") {
    try {
      await redis.ping();
      await db.query("select 1");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, redis: "connected", db: "connected" }));
      return;
    } catch (error) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: false,
          message: error instanceof Error ? error.message : "Readiness check failed"
        })
      );
      return;
    }
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: false, message: "Not found" }));
});

healthServer.listen(workerPort, () => {
  console.log(`Worker health server listening on ${workerPort}`);
});

type QueueMode = "bullmq" | "fallback";
type QueueName =
  | "payment-confirmation-checker"
  | "binance-transaction-monitor"
  | "blockchain-monitor"
  | "webhook-dispatcher"
  | "settlement-processor"
  | "withdrawal-processor"
  | "batch-payout-processor"
  | "automation-executor";
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
  settlements: "settlement-processor",
  withdrawals: "withdrawal-processor",
  batchPayouts: "batch-payout-processor",
  automations: "automation-executor"
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
let bullmqWithdrawalQueue: Queue | null = null;
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
    binance_api_key_enc: string | null;
    binance_api_secret_enc: string | null;
    status: string;
    confirmations: number;
    tx_hash: string | null;
    amount_fiat: string;
    amount_crypto: string;
    expires_at: string;
    created_at: string;
  }>(
    `select
      p.id,
      p.merchant_id,
      p.settlement_currency,
      p.network,
      p.wallet_address,
      p.wallet_routes,
      m.binance_api_key_enc,
      m.binance_api_secret_enc,
      p.status,
      p.confirmations,
      p.tx_hash,
      p.amount_fiat,
      p.amount_crypto,
      p.expires_at,
      p.created_at
     from payments p
     join merchants m on m.id = p.merchant_id
     where p.id = $1
     limit 1`,
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
  await enqueueAutomationJob(`payment.${status}`, {
    paymentId,
    merchantId: paymentResult.rows[0].merchant_id,
    status,
    confirmations,
    txHash
  });
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

  if (payment.tx_hash && payment.tx_hash !== observation.txHash) {
    throw new Error("Observed transaction hash does not match the recorded payment transaction");
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

    const payment = await loadPayment(payload.paymentId);
    if (!payment) {
      throw new Error("Payment not found for provider reconciliation");
    }

    const observation = await observePayment(payment);
    if (!observation) {
      throw new Error("Provider reconciliation could not verify settlement yet");
    }
    if (observation.status !== "confirmed") {
      throw new Error("Provider reconciliation has not confirmed the transaction yet");
    }
    if (observation.txHash !== settlement.tx_hash) {
      throw new Error("Provider reconciliation returned a different transaction hash");
    }
    if (observation.confirmations < (requiredConfirmations[payment.network] ?? 1)) {
      throw new Error("Provider reconciliation did not meet confirmation threshold");
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
        observation.txHash,
        JSON.stringify({
          confirmations: observation.confirmations,
          source: "verified_provider_observation"
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
    await enqueueAutomationJob("settlement.completed", {
      paymentId: payload.paymentId,
      merchantId: payload.merchantId,
      settlementId: settlement.transaction_id,
      asset: settlement.settlement_currency,
      network: settlement.network,
      amountCrypto: settlement.amount_crypto,
      amountFiat: settlement.amount_fiat,
      txHash: settlement.tx_hash
    });
  } catch (error) {
    void recordWorkerMetric(redis, "settlementFailedTotal").catch((telemetryError) =>
      console.error("Failed to record settlement failure telemetry", telemetryError)
    );
    throw error;
  }
};

const enqueueWithdrawalJob = async (withdrawalId: string, performedBy = "worker", delay = 0) => {
  const mode = await getQueueMode();
  const options = {
    jobId: `withdrawal:${withdrawalId}:${delay ? Date.now() : "process"}`,
    delay,
    attempts: 5,
    backoff: {
      type: "exponential" as const,
      delay: 30_000
    },
    removeOnComplete: true,
    removeOnFail: false
  };

  if (mode === "bullmq") {
    if (!bullmqWithdrawalQueue) {
      bullmqWithdrawalQueue = new Queue(queueNames.withdrawals, { connection: redis });
    }
    await bullmqWithdrawalQueue.add("process", { withdrawalId, performedBy }, options);
    return;
  }

  await enqueueFallbackJob(queueNames.withdrawals, "process", { withdrawalId, performedBy }, options);
};

const enqueueAutomationJob = async (
  eventType: string,
  eventData: Record<string, unknown>,
  delay = 0
) => {
  const mode = await getQueueMode();
  const options = {
    jobId: `automation:${eventType}:${crypto
      .createHash("sha256")
      .update(JSON.stringify(eventData))
      .digest("hex")
      .slice(0, 24)}:${delay ? Date.now() : "now"}`,
    delay,
    attempts: 3,
    backoff: {
      type: "exponential" as const,
      delay: 20_000
    },
    removeOnComplete: true,
    removeOnFail: false
  };

  if (mode === "bullmq") {
    const queue = new Queue(queueNames.automations, { connection: redis });
    await queue.add("execute", { eventType, eventData }, options);
    await queue.close();
    return;
  }

  await enqueueFallbackJob(queueNames.automations, "execute", { eventType, eventData }, options);
};

type TreasuryBalanceType = "inbound" | "aggregation" | "cold_vault" | "withdrawable" | "pending";
type OwnerType = "platform" | "merchant";

type TreasuryWithdrawalRow = {
  id: string;
  owner_type: OwnerType;
  owner_id: string;
  asset: string;
  network: string;
  amount_crypto: string;
  amount_fiat_equivalent: string;
  destination_address: string;
  gas_fee_crypto: string;
  gas_fee_fiat: string;
  penalty_fee_crypto: string;
  penalty_fee_fiat: string;
  final_amount_crypto: string;
  tx_hash: string | null;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  approved_at: string | null;
  metadata: Record<string, unknown> | null;
};

const toNumber = (value: string | number | null | undefined, scale = 8) => {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Number(numeric.toFixed(scale));
};

const withDbTransaction = async <T>(callback: (client: PoolClient) => Promise<T>) => {
  const client = await db.connect();
  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch((rollbackError) => {
      console.error("Failed to roll back worker transaction", rollbackError);
    });
    throw error;
  } finally {
    client.release();
  }
};

const getTreasuryBalanceRow = async (
  client: PoolClient,
  ownerType: OwnerType,
  ownerId: string,
  asset: string,
  network: string,
  balanceType: TreasuryBalanceType
) => {
  const result = await client.query<{ amount_crypto: string; amount_fiat_equivalent: string }>(
    `select amount_crypto, amount_fiat_equivalent
     from treasury_balances
     where owner_type = $1 and owner_id = $2 and asset = $3 and network = $4 and balance_type = $5
     limit 1`,
    [ownerType, ownerId, asset, network, balanceType]
  );
  return result.rows[0] ?? null;
};

const mutateTreasuryBalance = async (
  client: PoolClient,
  input: {
    ownerType: OwnerType;
    ownerId: string;
    asset: string;
    network: string;
    balanceType: TreasuryBalanceType;
    amountCryptoDelta: number;
    amountFiatDelta: number;
    requireSufficientFunds?: boolean;
  }
) => {
  const current = await getTreasuryBalanceRow(
    client,
    input.ownerType,
    input.ownerId,
    input.asset,
    input.network,
    input.balanceType
  );
  const nextCrypto = Number((toNumber(current?.amount_crypto, 8) + input.amountCryptoDelta).toFixed(8));
  const nextFiat = Number((toNumber(current?.amount_fiat_equivalent, 2) + input.amountFiatDelta).toFixed(2));

  if (input.requireSufficientFunds && nextCrypto < 0) {
    throw new Error(`Insufficient ${input.balanceType} balance for ${input.ownerType}:${input.ownerId}`);
  }

  await client.query(
    `insert into treasury_balances (
       owner_type, owner_id, asset, network, balance_type, amount_crypto, amount_fiat_equivalent, last_updated_at
     ) values ($1,$2,$3,$4,$5,$6,$7,now())
     on conflict (owner_type, owner_id, asset, network, balance_type)
     do update set
       amount_crypto = excluded.amount_crypto,
       amount_fiat_equivalent = excluded.amount_fiat_equivalent,
       last_updated_at = now()`,
    [
      input.ownerType,
      input.ownerId,
      input.asset,
      input.network,
      input.balanceType,
      nextCrypto,
      nextFiat
    ]
  );
};

const insertTreasuryTransaction = async (
  client: PoolClient,
  input: {
    ownerType: OwnerType;
    ownerId: string;
    asset: string;
    network: string;
    transactionType: string;
    amountCrypto: number;
    amountFiatEquivalent: number;
    fromBalanceType?: string;
    toBalanceType?: string;
    relatedWithdrawalId?: string;
    txHash?: string | null;
    description?: string;
    metadata?: Record<string, unknown>;
    status?: "pending" | "completed" | "failed";
  }
) => {
  await client.query(
    `insert into treasury_transactions (
      owner_type, owner_id, asset, network, transaction_type, amount_crypto, amount_fiat_equivalent,
      from_balance_type, to_balance_type, related_withdrawal_id, tx_hash, description, metadata, status
    ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14)`,
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
      input.relatedWithdrawalId ?? null,
      input.txHash ?? null,
      input.description ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.status ?? "completed"
    ]
  );
};

const insertTreasuryFee = async (
  client: PoolClient,
  input: {
    withdrawalId: string;
    asset: string;
    network: string;
    feeType: "gas" | "withdrawal_penalty";
    amountCrypto: number;
    amountFiat: number;
    description: string;
  }
) => {
  await client.query(
    `insert into treasury_fees (
      owner_type, owner_id, payment_id, asset, network, fee_percent, amount_crypto,
      amount_fiat, exchange_rate, fee_type, description
    ) values ('platform','platform',$1,$2,$3,0,$4,$5,1,$6,$7)`,
    [
      input.withdrawalId,
      input.asset,
      input.network,
      input.amountCrypto,
      input.amountFiat,
      input.feeType,
      input.description
    ]
  );
};

const binanceNetworkMap: Record<string, string> = {
  BTC: "BTC",
  ERC20: "ETH",
  TRC20: "TRX",
  SOL: "SOL"
};

const signedBinanceRequest = async <T>(
  pathName: string,
  params: Record<string, string | number | undefined>,
  method: "GET" | "POST" = "GET"
) => {
  const apiKey = process.env.BINANCE_API_KEY?.trim();
  const apiSecret = process.env.BINANCE_API_SECRET?.trim();
  if (!apiKey || !apiSecret) {
    throw new Error("Binance API credentials are not configured for withdrawal execution");
  }

  const queryParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      queryParams.set(key, String(value));
    }
  }
  queryParams.set("recvWindow", "60000");
  queryParams.set("timestamp", String(Date.now()));
  const signature = crypto.createHmac("sha256", apiSecret).update(queryParams.toString()).digest("hex");
  queryParams.set("signature", signature);

  const response = await fetch(`${binanceBaseUrl}${pathName}?${queryParams.toString()}`, {
    method,
    headers: {
      "X-MBX-APIKEY": apiKey
    }
  });
  const payload = (await response.json().catch(() => ({}))) as T & { msg?: string };
  if (!response.ok) {
    throw new Error(payload.msg ?? `Binance request failed with ${response.status}`);
  }
  return payload;
};

const submitBinanceWithdrawal = async (withdrawal: TreasuryWithdrawalRow) => {
  const response = await signedBinanceRequest<{ id?: string; msg?: string }>(
    "/sapi/v1/capital/withdraw/apply",
    {
      coin: withdrawal.asset,
      network: binanceNetworkMap[withdrawal.network] ?? withdrawal.network,
      amount: toNumber(withdrawal.final_amount_crypto, 8),
      address: withdrawal.destination_address,
      withdrawOrderId: withdrawal.id
    },
    "POST"
  );

  if (!response.id) {
    throw new Error(response.msg ?? "Binance withdrawal did not return a provider reference");
  }

  return {
    provider: "binance",
    providerReference: response.id,
    txHash: null as string | null
  };
};

type BinanceWithdrawalHistoryRow = {
  id: string;
  amount: string;
  transactionFee?: string;
  coin: string;
  status: number;
  address: string;
  txId?: string;
  network?: string;
  info?: string;
  confirmNo?: number;
  completeTime?: string;
  withdrawOrderId?: string;
};

const fetchBinanceWithdrawalHistory = async (withdrawal: TreasuryWithdrawalRow) => {
  const metadata = typeof withdrawal.metadata === "object" && withdrawal.metadata ? withdrawal.metadata : {};
  const providerReference = typeof metadata.providerReference === "string" ? metadata.providerReference : undefined;
  const rows = await signedBinanceRequest<BinanceWithdrawalHistoryRow[]>(
    "/sapi/v1/capital/withdraw/history",
    {
      coin: withdrawal.asset,
      withdrawOrderId: withdrawal.id,
      idList: providerReference,
      startTime: Date.now() - 6 * 24 * 60 * 60 * 1000,
      endTime: Date.now(),
      limit: 100
    },
    "GET"
  );

  return rows.find((row) => row.withdrawOrderId === withdrawal.id || row.id === providerReference) ?? null;
};

const refreshBatchStatusForWithdrawal = async (client: PoolClient, withdrawalId: string) => {
  const result = await client.query<{ batch_id: string }>(
    `select batch_id
       from batch_payout_items
      where withdrawal_id = $1
      limit 1`,
    [withdrawalId]
  );
  const batchId = result.rows[0]?.batch_id;
  if (!batchId) {
    return;
  }

  const counts = await client.query<{
    total: string;
    completed: string;
    failed: string;
    active: string;
  }>(
    `select
       count(*)::int as total,
       count(*) filter (where status = 'completed')::int as completed,
       count(*) filter (where status = 'failed')::int as failed,
       count(*) filter (where status in ('pending','processing'))::int as active
     from batch_payout_items
     where batch_id = $1`,
    [batchId]
  );
  const row = counts.rows[0];
  const total = Number(row?.total ?? 0);
  const completed = Number(row?.completed ?? 0);
  const failed = Number(row?.failed ?? 0);
  const active = Number(row?.active ?? 0);
  const finalStatus =
    active > 0
      ? "processing"
      : failed === 0
        ? "completed"
        : completed > 0
          ? "partial"
          : "failed";

  await client.query(
    `update batch_payouts
     set status = $2,
         success_count = $3,
         failure_count = $4,
         updated_at = now()
     where id = $1`,
    [batchId, finalStatus, completed, failed]
  );

  if (finalStatus === "completed") {
    await client.query(
      `update payroll_runs
       set status = 'completed',
           processed_at = now()
       where batch_payout_id = $1 and status = 'processing'`,
      [batchId]
    );
    await client.query(
      `update payslips
       set status = 'paid'
       where payroll_run_id in (select id from payroll_runs where batch_payout_id = $1)
         and status = 'pending'`,
      [batchId]
    );
  }
};

const reconcileSubmittedWithdrawal = async (withdrawal: TreasuryWithdrawalRow, performedBy: string) => {
  const history = await fetchBinanceWithdrawalHistory(withdrawal);
  if (!history) {
    await enqueueWithdrawalJob(withdrawal.id, performedBy, 60_000);
    throw new Error("Binance withdrawal history has not returned this withdrawal yet");
  }

  if (history.status === 6 && history.txId) {
    await withDbTransaction(async (client) => {
      const metadata = typeof withdrawal.metadata === "object" && withdrawal.metadata ? withdrawal.metadata : {};
      await client.query(
        `update treasury_withdrawals
         set status = 'completed',
             tx_hash = $2,
             processed_by = $3,
             processed_at = coalesce(processed_at, now()),
             metadata = $4::jsonb,
             updated_at = now()
         where id = $1 and status = 'processing'`,
        [
          withdrawal.id,
          history.txId,
          performedBy,
          JSON.stringify({
            ...metadata,
            providerStatus: history.status,
            providerCompleteTime: history.completeTime ?? null,
            confirmNo: history.confirmNo ?? null,
            reconciledAt: new Date().toISOString()
          })
        ]
      );
      await client.query(
        `update treasury_transactions
         set tx_hash = $2,
             status = 'completed',
             metadata = metadata || $3::jsonb
         where related_withdrawal_id = $1 and transaction_type = 'withdrawal_processed'`,
        [
          withdrawal.id,
          history.txId,
          JSON.stringify({
            providerStatus: history.status,
            providerCompleteTime: history.completeTime ?? null,
            confirmNo: history.confirmNo ?? null
          })
        ]
      );
      await client.query(
        `update batch_payout_items
         set status = 'completed',
             processed_at = now(),
             error_message = null
         where withdrawal_id = $1`,
        [withdrawal.id]
      );
      await refreshBatchStatusForWithdrawal(client, withdrawal.id);
    });
    void recordWorkerMetric(redis, "withdrawalCompletedTotal").catch((error) =>
      console.error("Failed to record withdrawal completion telemetry", error)
    );
    await enqueueAutomationJob("withdrawal.completed", {
      withdrawalId: withdrawal.id,
      merchantId: withdrawal.owner_type === "merchant" ? withdrawal.owner_id : undefined,
      ownerType: withdrawal.owner_type,
      ownerId: withdrawal.owner_id,
      asset: withdrawal.asset,
      network: withdrawal.network,
      amountCrypto: withdrawal.amount_crypto,
      txHash: history.txId
    });
    return;
  }

  if ([1, 3, 5].includes(history.status)) {
    const message = history.info || `Binance withdrawal finished with failure status ${history.status}`;
    await withDbTransaction(async (client) => {
      const gasFeeCrypto = toNumber(withdrawal.gas_fee_crypto, 8);
      const gasFeeFiat = toNumber(withdrawal.gas_fee_fiat, 2);
      const penaltyFeeCrypto = toNumber(withdrawal.penalty_fee_crypto, 8);
      const penaltyFeeFiat = toNumber(withdrawal.penalty_fee_fiat, 2);
      const totalFeeCrypto = Number((gasFeeCrypto + penaltyFeeCrypto).toFixed(8));
      const totalFeeFiat = Number((gasFeeFiat + penaltyFeeFiat).toFixed(2));

      await client.query(
        `update treasury_withdrawals
         set status = 'failed',
             rejection_reason = $2,
             processed_by = $3,
             updated_at = now()
         where id = $1 and status = 'processing'`,
        [withdrawal.id, message, performedBy]
      );
      await mutateTreasuryBalance(client, {
        ownerType: withdrawal.owner_type,
        ownerId: withdrawal.owner_id,
        asset: withdrawal.asset,
        network: withdrawal.network,
        balanceType: "withdrawable",
        amountCryptoDelta: toNumber(withdrawal.amount_crypto, 8),
        amountFiatDelta: toNumber(withdrawal.amount_fiat_equivalent, 2)
      });
      if (totalFeeCrypto > 0 || totalFeeFiat > 0) {
        await mutateTreasuryBalance(client, {
          ownerType: "platform",
          ownerId: "platform",
          asset: withdrawal.asset,
          network: withdrawal.network,
          balanceType: "inbound",
          amountCryptoDelta: -totalFeeCrypto,
          amountFiatDelta: -totalFeeFiat
        });
      }
      await insertTreasuryTransaction(client, {
        ownerType: withdrawal.owner_type,
        ownerId: withdrawal.owner_id,
        asset: withdrawal.asset,
        network: withdrawal.network,
        transactionType: "withdrawal_failed",
        amountCrypto: toNumber(withdrawal.amount_crypto, 8),
        amountFiatEquivalent: toNumber(withdrawal.amount_fiat_equivalent, 2),
        toBalanceType: "withdrawable",
        relatedWithdrawalId: withdrawal.id,
        description: "Treasury withdrawal failed after provider submission and balance was restored",
        metadata: { providerStatus: history.status, error: message },
        status: "failed"
      });
      await client.query(
        `update batch_payout_items
         set status = 'failed',
             error_message = $2,
             processed_at = now()
         where withdrawal_id = $1`,
        [withdrawal.id, message]
      );
      await refreshBatchStatusForWithdrawal(client, withdrawal.id);
    });
    await enqueueAutomationJob("withdrawal.failed", {
      withdrawalId: withdrawal.id,
      merchantId: withdrawal.owner_type === "merchant" ? withdrawal.owner_id : undefined,
      ownerType: withdrawal.owner_type,
      ownerId: withdrawal.owner_id,
      asset: withdrawal.asset,
      network: withdrawal.network,
      amountCrypto: withdrawal.amount_crypto,
      error: message,
      providerStatus: history.status
    });
    throw new Error(message);
  }

  await enqueueWithdrawalJob(withdrawal.id, performedBy, 90_000);
  throw new Error(`Binance withdrawal still processing with status ${history.status}`);
};

const failWithdrawalAndRestoreBalance = async (
  withdrawal: TreasuryWithdrawalRow,
  performedBy: string,
  error: unknown
) => {
  const message = error instanceof Error ? error.message : "Withdrawal execution failed";
  await withDbTransaction(async (client) => {
    await client.query(
      `update treasury_withdrawals
       set status = 'failed',
           rejection_reason = $2,
           processed_by = $3,
           updated_at = now()
       where id = $1`,
      [withdrawal.id, message, performedBy]
    );
    await mutateTreasuryBalance(client, {
      ownerType: withdrawal.owner_type,
      ownerId: withdrawal.owner_id,
      asset: withdrawal.asset,
      network: withdrawal.network,
      balanceType: "pending",
      amountCryptoDelta: -toNumber(withdrawal.amount_crypto, 8),
      amountFiatDelta: -toNumber(withdrawal.amount_fiat_equivalent, 2)
    });
    await mutateTreasuryBalance(client, {
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
      description: "Treasury withdrawal failed in worker and balance was restored",
      metadata: { error: message },
      status: "failed"
    });
  });
};

const handleWithdrawalJob = async (payload: { withdrawalId: string; performedBy?: string }) => {
  const performedBy = payload.performedBy ?? "worker";
  const withdrawalResult = await db.query<TreasuryWithdrawalRow>(
    `select *
     from treasury_withdrawals
     where id = $1 and status in ('pending', 'processing')
     limit 1`,
    [payload.withdrawalId]
  );
  const withdrawal = withdrawalResult.rows[0];
  if (!withdrawal) {
    throw new Error("Withdrawal not found or already terminal");
  }

  const metadata = typeof withdrawal.metadata === "object" && withdrawal.metadata ? withdrawal.metadata : {};
  if (metadata.providerReference) {
    await reconcileSubmittedWithdrawal(withdrawal, performedBy);
    return;
  }
  if (metadata.requiresApproval && !withdrawal.approved_at) {
    throw new Error("Admin approval is required before processing this withdrawal");
  }

  await db.query(
    `update treasury_withdrawals
     set status = 'processing',
         processed_by = $2,
         updated_at = now()
     where id = $1 and status = 'pending'`,
    [withdrawal.id, performedBy]
  );

  let providerExecution: Awaited<ReturnType<typeof submitBinanceWithdrawal>>;
  try {
    providerExecution = await submitBinanceWithdrawal(withdrawal);
  } catch (error) {
    await failWithdrawalAndRestoreBalance(withdrawal, performedBy, error);
    await enqueueAutomationJob("withdrawal.failed", {
      withdrawalId: withdrawal.id,
      merchantId: withdrawal.owner_type === "merchant" ? withdrawal.owner_id : undefined,
      ownerType: withdrawal.owner_type,
      ownerId: withdrawal.owner_id,
      asset: withdrawal.asset,
      network: withdrawal.network,
      amountCrypto: withdrawal.amount_crypto,
      error: error instanceof Error ? error.message : "Withdrawal execution failed"
    });
    throw error;
  }

  await withDbTransaction(async (client) => {
    await mutateTreasuryBalance(client, {
      ownerType: withdrawal.owner_type,
      ownerId: withdrawal.owner_id,
      asset: withdrawal.asset,
      network: withdrawal.network,
      balanceType: "pending",
      amountCryptoDelta: -toNumber(withdrawal.amount_crypto, 8),
      amountFiatDelta: -toNumber(withdrawal.amount_fiat_equivalent, 2),
      requireSufficientFunds: true
    });

    const gasFeeCrypto = toNumber(withdrawal.gas_fee_crypto, 8);
    const gasFeeFiat = toNumber(withdrawal.gas_fee_fiat, 2);
    const penaltyFeeCrypto = toNumber(withdrawal.penalty_fee_crypto, 8);
    const penaltyFeeFiat = toNumber(withdrawal.penalty_fee_fiat, 2);
    const totalFeeCrypto = Number((gasFeeCrypto + penaltyFeeCrypto).toFixed(8));
    const totalFeeFiat = Number((gasFeeFiat + penaltyFeeFiat).toFixed(2));

    if (gasFeeCrypto > 0 || gasFeeFiat > 0) {
      await insertTreasuryFee(client, {
        withdrawalId: withdrawal.id,
        asset: withdrawal.asset,
        network: withdrawal.network,
        feeType: "gas",
        amountCrypto: gasFeeCrypto,
        amountFiat: gasFeeFiat,
        description: "Treasury gas fee collected on withdrawal"
      });
    }

    if (penaltyFeeCrypto > 0 || penaltyFeeFiat > 0) {
      await insertTreasuryFee(client, {
        withdrawalId: withdrawal.id,
        asset: withdrawal.asset,
        network: withdrawal.network,
        feeType: "withdrawal_penalty",
        amountCrypto: penaltyFeeCrypto,
        amountFiat: penaltyFeeFiat,
        description: "Treasury early-withdrawal penalty collected"
      });
    }

    if (totalFeeCrypto > 0 || totalFeeFiat > 0) {
      await mutateTreasuryBalance(client, {
        ownerType: "platform",
        ownerId: "platform",
        asset: withdrawal.asset,
        network: withdrawal.network,
        balanceType: "inbound",
        amountCryptoDelta: totalFeeCrypto,
        amountFiatDelta: totalFeeFiat
      });
    }

    const nextMetadata = {
      ...metadata,
      provider: providerExecution.provider,
      providerReference: providerExecution.providerReference,
      submissionRecordedAt: new Date().toISOString(),
      executionMode: "worker_queue"
    };

    await client.query(
      `update treasury_withdrawals
       set status = 'processing',
           tx_hash = coalesce($2, tx_hash),
           processed_by = $3,
           processed_at = now(),
           metadata = $4::jsonb,
           updated_at = now()
       where id = $1`,
      [withdrawal.id, providerExecution.txHash, performedBy, JSON.stringify(nextMetadata)]
    );

    const exchangeRate = toNumber(withdrawal.amount_fiat_equivalent, 2) / Math.max(toNumber(withdrawal.amount_crypto, 8), 0.00000001);
    await insertTreasuryTransaction(client, {
      ownerType: withdrawal.owner_type,
      ownerId: withdrawal.owner_id,
      asset: withdrawal.asset,
      network: withdrawal.network,
      transactionType: "withdrawal_processed",
      amountCrypto: toNumber(withdrawal.final_amount_crypto, 8),
      amountFiatEquivalent: Number((toNumber(withdrawal.final_amount_crypto, 8) * exchangeRate).toFixed(2)),
      fromBalanceType: "pending",
      relatedWithdrawalId: withdrawal.id,
      txHash: providerExecution.txHash,
      description: "Treasury withdrawal submitted to provider by worker",
      metadata: nextMetadata,
      status: "pending"
    });
  });

  void recordWorkerMetric(redis, "withdrawalSubmittedTotal").catch((error) =>
    console.error("Failed to record withdrawal telemetry", error)
  );
  await enqueueWithdrawalJob(withdrawal.id, performedBy, 90_000);
};

type BatchPayoutRow = {
  id: string;
  merchant_id: string;
  asset: string;
  network: string;
  status: "pending" | "processing" | "completed" | "partial" | "failed" | "cancelled";
};

type BatchPayoutItemRow = {
  id: string;
  amount_crypto: string;
  amount_fiat: string;
  destination_address: string;
  reference: string | null;
};

const LARGE_BATCH_WITHDRAWAL_APPROVAL_THRESHOLD_FIAT = 1_000;

const assertBatchDestinationWhitelisted = async (
  client: PoolClient,
  merchantId: string,
  asset: string,
  network: string,
  destinationAddress: string
) => {
  const result = await client.query<{ source: string }>(
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
    [merchantId, asset, network, destinationAddress]
  );

  if (!result.rows[0]) {
    throw new Error("Batch payout destination must be an active connected wallet or whitelisted treasury address");
  }
};

const calculateBatchWithdrawalFees = async (
  client: PoolClient,
  asset: string,
  network: string,
  amountCrypto: number,
  amountFiat: number
) => {
  const config = await client.query<{
    min_withdrawal_amount_fiat: string;
    min_withdrawal_penalty_fiat: string;
    min_withdrawal_penalty_crypto: string;
    gas_fee_fixed_crypto: string;
    gas_fee_fixed_fiat: string;
    gas_fee_percent: string;
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
  const row = config.rows[0];
  if (!row) {
    throw new Error(`Withdrawal fee configuration is missing for ${asset}/${network}`);
  }

  const gasFeeFixedCrypto = toNumber(row.gas_fee_fixed_crypto, 8);
  const gasFeeFixedFiat = toNumber(row.gas_fee_fixed_fiat, 2);
  const gasFeePercent = toNumber(row.gas_fee_percent, 4);
  const minWithdrawalAmountFiat = toNumber(row.min_withdrawal_amount_fiat, 2);
  const minWithdrawalPenaltyFiat = toNumber(row.min_withdrawal_penalty_fiat, 2);
  const minWithdrawalPenaltyCrypto = toNumber(row.min_withdrawal_penalty_crypto, 8);

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

  return {
    gasFeeCrypto,
    gasFeeFiat,
    penaltyFeeCrypto,
    penaltyFeeFiat,
    finalAmountCrypto: Number((amountCrypto - gasFeeCrypto - penaltyFeeCrypto).toFixed(8))
  };
};

const createBatchWithdrawal = async (
  client: PoolClient,
  batch: BatchPayoutRow,
  item: BatchPayoutItemRow,
  performedBy: string
) => {
  const amountCrypto = toNumber(item.amount_crypto, 8);
  const amountFiat = toNumber(item.amount_fiat, 2);
  if (amountCrypto <= 0) {
    throw new Error("Batch payout amount must be greater than zero");
  }

  await assertBatchDestinationWhitelisted(
    client,
    batch.merchant_id,
    batch.asset,
    batch.network,
    item.destination_address
  );

  const balance = await getTreasuryBalanceRow(
    client,
    "merchant",
    batch.merchant_id,
    batch.asset,
    batch.network,
    "withdrawable"
  );
  if (toNumber(balance?.amount_crypto, 8) < amountCrypto) {
    throw new Error("Insufficient withdrawable balance for batch payout item");
  }

  const fees = await calculateBatchWithdrawalFees(client, batch.asset, batch.network, amountCrypto, amountFiat);
  if (fees.finalAmountCrypto <= 0) {
    throw new Error("Batch payout amount after fees is too low");
  }

  const withdrawalResult = await client.query<{ id: string }>(
    `insert into treasury_withdrawals (
      owner_type, owner_id, asset, network, amount_crypto, amount_fiat_equivalent,
      destination_address, destination_wallet_provider, gas_fee_crypto, gas_fee_fiat,
      penalty_fee_crypto, penalty_fee_fiat, final_amount_crypto, processed_by, metadata
    ) values (
      'merchant', $1, $2, $3, $4, $5, $6, 'batch_payout', $7, $8, $9, $10, $11, $12, $13::jsonb
    )
    returning id`,
    [
      batch.merchant_id,
      batch.asset,
      batch.network,
      amountCrypto,
      amountFiat,
      item.destination_address,
      fees.gasFeeCrypto,
      fees.gasFeeFiat,
      fees.penaltyFeeCrypto,
      fees.penaltyFeeFiat,
      fees.finalAmountCrypto,
      performedBy,
      JSON.stringify({
        batchId: batch.id,
        batchItemId: item.id,
        reference: item.reference,
        requiresApproval: amountFiat >= LARGE_BATCH_WITHDRAWAL_APPROVAL_THRESHOLD_FIAT,
        requestedAt: new Date().toISOString()
      })
    ]
  );
  const withdrawalId = withdrawalResult.rows[0].id;

  await mutateTreasuryBalance(client, {
    ownerType: "merchant",
    ownerId: batch.merchant_id,
    asset: batch.asset,
    network: batch.network,
    balanceType: "withdrawable",
    amountCryptoDelta: -amountCrypto,
    amountFiatDelta: -amountFiat,
    requireSufficientFunds: true
  });
  await mutateTreasuryBalance(client, {
    ownerType: "merchant",
    ownerId: batch.merchant_id,
    asset: batch.asset,
    network: batch.network,
    balanceType: "pending",
    amountCryptoDelta: amountCrypto,
    amountFiatDelta: amountFiat
  });
  await insertTreasuryTransaction(client, {
    ownerType: "merchant",
    ownerId: batch.merchant_id,
    asset: batch.asset,
    network: batch.network,
    transactionType: "withdrawal_requested",
    amountCrypto,
    amountFiatEquivalent: amountFiat,
    fromBalanceType: "withdrawable",
    toBalanceType: "pending",
    relatedWithdrawalId: withdrawalId,
    description: "Batch payout withdrawal requested",
    metadata: {
      batchId: batch.id,
      batchItemId: item.id,
      reference: item.reference,
      fees
    },
    status: "pending"
  });

  return withdrawalId;
};

const refreshBatchStatus = async (client: PoolClient, batchId: string) => {
  const counts = await client.query<{
    completed: string;
    failed: string;
    active: string;
  }>(
    `select
       count(*) filter (where status = 'completed')::int as completed,
       count(*) filter (where status = 'failed')::int as failed,
       count(*) filter (where status in ('pending','processing'))::int as active
     from batch_payout_items
     where batch_id = $1`,
    [batchId]
  );
  const completed = Number(counts.rows[0]?.completed ?? 0);
  const failed = Number(counts.rows[0]?.failed ?? 0);
  const active = Number(counts.rows[0]?.active ?? 0);
  const status = active > 0 ? "processing" : failed === 0 ? "completed" : completed > 0 ? "partial" : "failed";
  await client.query(
    `update batch_payouts
     set status = $2,
         success_count = $3,
         failure_count = $4,
         updated_at = now()
     where id = $1`,
    [batchId, status, completed, failed]
  );
};

const handleBatchPayoutJob = async (payload: { batchId: string; performedBy?: string }) => {
  const performedBy = payload.performedBy ?? "worker";
  const batchResult = await db.query<BatchPayoutRow>(
    `select id, merchant_id, asset, network, status
       from batch_payouts
      where id = $1 and status in ('pending','processing')
      limit 1`,
    [payload.batchId]
  );
  const batch = batchResult.rows[0];
  if (!batch) {
    throw new Error("Batch payout not found or already terminal");
  }

  if (batch.status === "pending") {
    await db.query(
      `update batch_payouts
       set status = 'processing',
           performed_by = $2,
           updated_at = now()
       where id = $1`,
      [batch.id, performedBy]
    );
  }

  const itemResult = await db.query<BatchPayoutItemRow>(
    `select id, amount_crypto, amount_fiat, destination_address, reference
       from batch_payout_items
      where batch_id = $1 and status = 'pending'
      order by created_at asc`,
    [batch.id]
  );

  for (const item of itemResult.rows) {
    try {
      const withdrawalId = await withDbTransaction(async (client) => {
        const id = await createBatchWithdrawal(client, batch, item, performedBy);
        await client.query(
          `update batch_payout_items
           set status = 'processing',
               withdrawal_id = $2
           where id = $1 and status = 'pending'`,
          [item.id, id]
        );
        return id;
      });
      await enqueueWithdrawalJob(withdrawalId, performedBy);
    } catch (error) {
      await db.query(
        `update batch_payout_items
         set status = 'failed',
             error_message = $2,
             processed_at = now()
         where id = $1 and status = 'pending'`,
        [item.id, error instanceof Error ? error.message : "Batch payout item failed"]
      );
    }
  }

  await withDbTransaction(async (client) => {
    await refreshBatchStatus(client, batch.id);
  });
};

type AutomationRuleRow = {
  id: string;
  name: string;
  conditions: Record<string, unknown>;
  actions: Array<{ type: string; params: Record<string, unknown> }>;
  merchant_id: string | null;
};

const nestedValue = (value: Record<string, unknown>, pathName: string): unknown =>
  pathName.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in current) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, value);

const automationConditionsMet = (
  conditions: Record<string, unknown>,
  eventData: Record<string, unknown>
) => {
  for (const [pathName, expected] of Object.entries(conditions ?? {})) {
    const actual = nestedValue(eventData, pathName);
    if (expected && typeof expected === "object" && "operator" in expected) {
      const condition = expected as { operator: string; value: unknown };
      switch (condition.operator) {
        case "eq":
          if (actual !== condition.value) return false;
          break;
        case "neq":
          if (actual === condition.value) return false;
          break;
        case "gt":
          if (Number(actual) <= Number(condition.value)) return false;
          break;
        case "gte":
          if (Number(actual) < Number(condition.value)) return false;
          break;
        case "lt":
          if (Number(actual) >= Number(condition.value)) return false;
          break;
        case "lte":
          if (Number(actual) > Number(condition.value)) return false;
          break;
        case "contains":
          if (!String(actual ?? "").includes(String(condition.value ?? ""))) return false;
          break;
        case "exists":
          if (actual === undefined || actual === null) return false;
          break;
        default:
          return false;
      }
      continue;
    }

    if (actual !== expected) {
      return false;
    }
  }
  return true;
};

const executeAutomationWithdrawal = async (
  params: Record<string, unknown>,
  eventData: Record<string, unknown>
) => {
  const ownerType = params.ownerType === "platform" ? "platform" : "merchant";
  const ownerId =
    typeof params.ownerId === "string" && params.ownerId.trim()
      ? params.ownerId.trim()
      : typeof eventData.merchantId === "string"
        ? eventData.merchantId
        : "";
  const asset = typeof params.asset === "string" ? params.asset.trim().toUpperCase() : "";
  const network = typeof params.network === "string" ? params.network.trim().toUpperCase() : "";
  const destinationAddress = typeof params.destinationAddress === "string" ? params.destinationAddress.trim() : "";
  const amountCrypto = toNumber(Number(params.amountCrypto ?? 0), 8);
  const amountFiatEquivalent = toNumber(Number(params.amountFiatEquivalent ?? amountCrypto), 2);

  if (!ownerId || !asset || !network || !destinationAddress || amountCrypto <= 0) {
    throw new Error("Automation withdrawal requires ownerId, asset, network, destinationAddress, and amountCrypto");
  }

  const withdrawalId = await withDbTransaction(async (client) => {
    if (ownerType === "merchant") {
      await assertBatchDestinationWhitelisted(client, ownerId, asset, network, destinationAddress);
    }
    const balance = await getTreasuryBalanceRow(client, ownerType, ownerId, asset, network, "withdrawable");
    if (toNumber(balance?.amount_crypto, 8) < amountCrypto) {
      throw new Error("Insufficient withdrawable balance for automation withdrawal");
    }
    const fees = await calculateBatchWithdrawalFees(client, asset, network, amountCrypto, amountFiatEquivalent);
    if (fees.finalAmountCrypto <= 0) {
      throw new Error("Automation withdrawal amount after fees is too low");
    }
    const result = await client.query<{ id: string }>(
      `insert into treasury_withdrawals (
        owner_type, owner_id, asset, network, amount_crypto, amount_fiat_equivalent,
        destination_address, destination_wallet_provider, gas_fee_crypto, gas_fee_fiat,
        penalty_fee_crypto, penalty_fee_fiat, final_amount_crypto, processed_by, metadata
      ) values (
        $1,$2,$3,$4,$5,$6,$7,'automation',$8,$9,$10,$11,$12,'automation',$13::jsonb
      )
      returning id`,
      [
        ownerType,
        ownerId,
        asset,
        network,
        amountCrypto,
        amountFiatEquivalent,
        destinationAddress,
        fees.gasFeeCrypto,
        fees.gasFeeFiat,
        fees.penaltyFeeCrypto,
        fees.penaltyFeeFiat,
        fees.finalAmountCrypto,
        JSON.stringify({
          automation: true,
          triggerEvent: eventData.eventType ?? null,
          requiresApproval: amountFiatEquivalent >= LARGE_BATCH_WITHDRAWAL_APPROVAL_THRESHOLD_FIAT,
          requestedAt: new Date().toISOString()
        })
      ]
    );
    const id = result.rows[0].id;
    await mutateTreasuryBalance(client, {
      ownerType,
      ownerId,
      asset,
      network,
      balanceType: "withdrawable",
      amountCryptoDelta: -amountCrypto,
      amountFiatDelta: -amountFiatEquivalent,
      requireSufficientFunds: true
    });
    await mutateTreasuryBalance(client, {
      ownerType,
      ownerId,
      asset,
      network,
      balanceType: "pending",
      amountCryptoDelta: amountCrypto,
      amountFiatDelta: amountFiatEquivalent
    });
    await insertTreasuryTransaction(client, {
      ownerType,
      ownerId,
      asset,
      network,
      transactionType: "withdrawal_requested",
      amountCrypto,
      amountFiatEquivalent,
      fromBalanceType: "withdrawable",
      toBalanceType: "pending",
      relatedWithdrawalId: id,
      description: "Automation withdrawal requested",
      metadata: { params, eventData, fees },
      status: "pending"
    });
    return id;
  });

  await enqueueWithdrawalJob(withdrawalId, "automation");
  return { withdrawalId };
};

const executeAutomationAction = async (
  action: { type: string; params: Record<string, unknown> },
  eventData: Record<string, unknown>
) => {
  const params = action.params ?? {};
  switch (action.type) {
    case "send_webhook": {
      const url = typeof params.url === "string" ? params.url : "";
      if (!url) throw new Error("Automation webhook URL is required");
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...((params.headers as Record<string, string> | undefined) ?? {})
        },
        body: JSON.stringify(eventData)
      });
      if (!response.ok) {
        throw new Error(`Automation webhook failed with ${response.status}`);
      }
      return { type: action.type, delivered: true };
    }
    case "send_email": {
      const recipients = Array.isArray(params.recipients)
        ? params.recipients.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];
      if (!recipients.length) throw new Error("Automation email recipients are required");
      const message = typeof params.message === "string" ? params.message : "Automation notification";
      await db.query(
        `insert into system_alerts (severity, source, message, metadata)
         values ('info', 'automation-email', $1, $2::jsonb)`,
        [message, JSON.stringify({ recipients, eventData })]
      );
      return { type: action.type, queued: true, recipients };
    }
    case "alert_admin": {
      const message = typeof params.message === "string" ? params.message : "Automation alert";
      await db.query(
        `insert into system_alerts (severity, source, message, metadata)
         values ($1, 'automation', $2, $3::jsonb)`,
        [typeof params.severity === "string" ? params.severity : "info", message, JSON.stringify(eventData)]
      );
      return { type: action.type, created: true };
    }
    case "block_merchant": {
      const merchantId =
        typeof params.merchantId === "string" && params.merchantId.trim()
          ? params.merchantId.trim()
          : typeof eventData.merchantId === "string"
            ? eventData.merchantId
            : "";
      if (!merchantId) throw new Error("Automation block_merchant requires merchantId");
      await db.query(`update merchants set status = 'blocked', updated_at = now() where id = $1`, [merchantId]);
      return { type: action.type, merchantId };
    }
    case "create_adjustment": {
      const ownerType = params.ownerType === "platform" ? "platform" : "merchant";
      const ownerId =
        typeof params.ownerId === "string" && params.ownerId.trim()
          ? params.ownerId.trim()
          : typeof eventData.merchantId === "string"
            ? eventData.merchantId
            : "";
      const asset = typeof params.asset === "string" ? params.asset.trim().toUpperCase() : "";
      const network = typeof params.network === "string" ? params.network.trim().toUpperCase() : "";
      const adjustmentType = params.adjustmentType === "debit" ? "adjustment_debit" : "adjustment_credit";
      const amountCrypto = toNumber(Number(params.amountCrypto ?? 0), 8);
      const amountFiat = toNumber(Number(params.amountFiatEquivalent ?? 0), 2);
      if (!ownerId || !asset || !network || amountCrypto <= 0) {
        throw new Error("Automation adjustment requires ownerId, asset, network, and amountCrypto");
      }
      await withDbTransaction(async (client) => {
        await mutateTreasuryBalance(client, {
          ownerType,
          ownerId,
          asset,
          network,
          balanceType: "withdrawable",
          amountCryptoDelta: adjustmentType === "adjustment_credit" ? amountCrypto : -amountCrypto,
          amountFiatDelta: adjustmentType === "adjustment_credit" ? amountFiat : -amountFiat,
          requireSufficientFunds: adjustmentType === "adjustment_debit"
        });
        await insertTreasuryTransaction(client, {
          ownerType,
          ownerId,
          asset,
          network,
          transactionType: adjustmentType,
          amountCrypto,
          amountFiatEquivalent: amountFiat,
          toBalanceType: adjustmentType === "adjustment_credit" ? "withdrawable" : undefined,
          fromBalanceType: adjustmentType === "adjustment_debit" ? "withdrawable" : undefined,
          description: typeof params.reason === "string" ? params.reason : "Automation treasury adjustment",
          metadata: { params, eventData }
        });
      });
      return { type: action.type, ownerType, ownerId };
    }
    case "create_withdrawal":
      return { type: action.type, ...(await executeAutomationWithdrawal(params, eventData)) };
    default:
      throw new Error(`Unsupported automation action: ${action.type}`);
  }
};

const handleAutomationJob = async (payload: { eventType: string; eventData: Record<string, unknown> }) => {
  const merchantId = typeof payload.eventData?.merchantId === "string" ? payload.eventData.merchantId : null;
  const rules = await db.query<AutomationRuleRow>(
    `select id, name, conditions, actions, merchant_id
       from automation_rules
      where trigger_event = $1
        and is_active = true
        and (merchant_id is null or merchant_id = coalesce($2, merchant_id))
      order by created_at asc`,
    [payload.eventType, merchantId]
  );

  for (const rule of rules.rows) {
    if (!automationConditionsMet(rule.conditions ?? {}, payload.eventData ?? {})) {
      continue;
    }

    const results: unknown[] = [];
    let executionStatus: "success" | "failed" | "partial" = "success";
    let errorMessage: string | null = null;
    for (const action of Array.isArray(rule.actions) ? rule.actions : []) {
      try {
        results.push(await executeAutomationAction(action, { ...payload.eventData, eventType: payload.eventType }));
      } catch (error) {
        executionStatus = results.length ? "partial" : "failed";
        errorMessage = error instanceof Error ? error.message : "Automation action failed";
        results.push({ type: action.type, error: errorMessage });
      }
    }

    await db.query(
      `insert into automation_executions (
        rule_id, trigger_event, event_data, execution_status, execution_results, error_message
      ) values ($1,$2,$3::jsonb,$4,$5::jsonb,$6)`,
      [
        rule.id,
        payload.eventType,
        JSON.stringify(payload.eventData ?? {}),
        executionStatus,
        JSON.stringify(results),
        errorMessage
      ]
    );
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

  const withdrawalWorker = new Worker(
    queueNames.withdrawals,
    async (job) => handleWithdrawalJob(job.data as { withdrawalId: string; performedBy?: string }),
    { connection: redis }
  );

  const batchPayoutWorker = new Worker(
    queueNames.batchPayouts,
    async (job) => handleBatchPayoutJob(job.data as { batchId: string; performedBy?: string }),
    { connection: redis }
  );

  const automationWorker = new Worker(
    queueNames.automations,
    async (job) => handleAutomationJob(job.data as { eventType: string; eventData: Record<string, unknown> }),
    { connection: redis }
  );

  activeWorkers = [
    confirmationWorker,
    binanceWorker,
    blockchainWorker,
    webhookWorker,
    settlementWorker,
    withdrawalWorker,
    batchPayoutWorker,
    automationWorker
  ];
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
    worker.on("active", (job) => {
      const latency = Date.now() - job.timestamp;
      void redis.lpush(`queue_latency:${job.queueName}`, String(latency))
        .then(() => redis.ltrim(`queue_latency:${job.queueName}`, 0, 99))
        .then(() => redis.expire(`queue_latency:${job.queueName}`, 60 * 60 * 24))
        .catch((error) => console.error("Failed to record queue latency", error));
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
    }),
    startFallbackConsumer<{ withdrawalId: string; performedBy?: string }>(queueNames.withdrawals, async (payload) => {
      await handleWithdrawalJob(payload);
    }),
    startFallbackConsumer<{ batchId: string; performedBy?: string }>(queueNames.batchPayouts, async (payload) => {
      await handleBatchPayoutJob(payload);
    }),
    startFallbackConsumer<{ eventType: string; eventData: Record<string, unknown> }>(
      queueNames.automations,
      async (payload) => {
        await handleAutomationJob(payload);
      }
    )
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
  if (bullmqWithdrawalQueue) {
    await bullmqWithdrawalQueue.close().catch((error) => {
      console.error("Failed to close withdrawal queue", error);
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

const heartbeat = async () => {
  await db.query(
    `insert into worker_heartbeats (worker_name, status, last_seen_at, metadata)
     values ($1,'online',now(),$2::jsonb)
     on conflict (worker_name) do update set
       status = 'online',
       last_seen_at = now(),
       metadata = excluded.metadata`,
    [workerName, JSON.stringify({ mode: await getQueueMode() })]
  );
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

setInterval(() => {
  heartbeat().catch((error) => console.error("Heartbeat failed", error));
}, 15000);
