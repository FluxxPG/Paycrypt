type RedisLike = {
  hincrby: (key: string, field: string, increment: number) => Promise<unknown>;
};

const telemetryKey = "telemetry:metrics";

export const recordWorkerMetric = async (redis: RedisLike, field: string, amount = 1) => {
  await redis.hincrby(telemetryKey, field, amount);
};
