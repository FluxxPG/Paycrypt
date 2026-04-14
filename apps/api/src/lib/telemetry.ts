import { redis } from "./redis.js";

const telemetryKey = "telemetry:metrics";

type PaymentTelemetryStatus = "created" | "pending" | "confirmed" | "failed" | "expired";

const increment = async (field: string, amount = 1) => {
  await redis.hincrby(telemetryKey, field, amount);
};

const incrementFloat = async (field: string, amount: number) => {
  await redis.hincrbyfloat(telemetryKey, field, amount);
};

const toNumber = (value: string | undefined) => Number(value ?? 0);

export const recordHttpRequest = async (statusCode: number, durationMs: number) => {
  await increment("httpRequestsTotal");
  if (statusCode >= 500) {
    await increment("httpServerErrorsTotal");
  } else if (statusCode >= 400) {
    await increment("httpClientErrorsTotal");
  }
  await incrementFloat("httpLatencyMsSum", durationMs);
  await increment("httpLatencyMsCount");
};

export const recordAuthResult = async (kind: "jwt" | "apiKey", success: boolean) => {
  const suffix = kind === "jwt" ? "Jwt" : "ApiKey";
  await increment(`auth${suffix}${success ? "Success" : "Failure"}Total`);
};

export const recordRateLimitHit = async () => {
  await increment("rateLimitedTotal");
};

export const recordIdempotencyHit = async () => {
  await increment("idempotencyHitsTotal");
};

export const recordPaymentStatus = async (status: PaymentTelemetryStatus) => {
  const map: Record<PaymentTelemetryStatus, string> = {
    created: "paymentCreatedTotal",
    pending: "paymentPendingTotal",
    confirmed: "paymentConfirmedTotal",
    failed: "paymentFailedTotal",
    expired: "paymentExpiredTotal"
  };
  await increment(map[status]);
};

export const recordWebhookDelivery = async (delivered: boolean) => {
  await increment(delivered ? "webhookDeliveredTotal" : "webhookFailedTotal");
};

export const recordSettlementResult = async (processed: boolean) => {
  await increment(processed ? "settlementProcessedTotal" : "settlementFailedTotal");
};

export const recordWorkerJobResult = async (completed: boolean) => {
  await increment(completed ? "workerJobsCompletedTotal" : "workerJobsFailedTotal");
};

export const readTelemetrySnapshot = async () => {
  const values = await redis.hgetall(telemetryKey);
  const requestLatencyMsSum = toNumber(values.httpLatencyMsSum);
  const requestLatencyMsCount = toNumber(values.httpLatencyMsCount);

  return {
    httpRequestsTotal: toNumber(values.httpRequestsTotal),
    httpClientErrorsTotal: toNumber(values.httpClientErrorsTotal),
    httpServerErrorsTotal: toNumber(values.httpServerErrorsTotal),
    httpLatencyMsSum: requestLatencyMsSum,
    httpLatencyMsCount: requestLatencyMsCount,
    httpLatencyMsAverage: requestLatencyMsCount > 0 ? requestLatencyMsSum / requestLatencyMsCount : 0,
    authJwtSuccessTotal: toNumber(values.authJwtSuccessTotal),
    authJwtFailureTotal: toNumber(values.authJwtFailureTotal),
    authApiKeySuccessTotal: toNumber(values.authApiKeySuccessTotal),
    authApiKeyFailureTotal: toNumber(values.authApiKeyFailureTotal),
    rateLimitedTotal: toNumber(values.rateLimitedTotal),
    idempotencyHitsTotal: toNumber(values.idempotencyHitsTotal),
    paymentCreatedTotal: toNumber(values.paymentCreatedTotal),
    paymentPendingTotal: toNumber(values.paymentPendingTotal),
    paymentConfirmedTotal: toNumber(values.paymentConfirmedTotal),
    paymentFailedTotal: toNumber(values.paymentFailedTotal),
    paymentExpiredTotal: toNumber(values.paymentExpiredTotal),
    webhookDeliveredTotal: toNumber(values.webhookDeliveredTotal),
    webhookFailedTotal: toNumber(values.webhookFailedTotal),
    settlementProcessedTotal: toNumber(values.settlementProcessedTotal),
    settlementFailedTotal: toNumber(values.settlementFailedTotal),
    workerJobsCompletedTotal: toNumber(values.workerJobsCompletedTotal),
    workerJobsFailedTotal: toNumber(values.workerJobsFailedTotal)
  };
};
