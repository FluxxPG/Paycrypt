import type Redis from "ioredis";

const telemetryKey = "telemetry:metrics";

export const recordWorkerMetric = async (redis: Redis, field: string, amount = 1) => {
  await redis.hincrby(telemetryKey, field, amount);
};
