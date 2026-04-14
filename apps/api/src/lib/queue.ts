import { Queue, type JobsOptions } from "bullmq";
import { redis } from "./redis.js";

type QueueMode = "bullmq" | "fallback";
type QueueCountName = "waiting" | "active" | "completed" | "failed" | "delayed" | "paused";
type FallbackJobOptions = JobsOptions;

type FallbackEnvelope<T> = {
  name: string;
  data: T;
  options: FallbackJobOptions;
  attemptsMade: number;
};

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

const queueMode = { value: null as QueueMode | null, promise: null as Promise<QueueMode> | null };

const getQueueMode = async (): Promise<QueueMode> => {
  if (queueMode.value) {
    return queueMode.value;
  }

  if (!queueMode.promise) {
    queueMode.promise = (async () => {
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

  queueMode.value = await queueMode.promise;
  return queueMode.value;
};

class QueueFacade<T = unknown> {
  private bullmqQueue: Queue | null = null;

  constructor(private readonly name: string) {}

  private get listKey() {
    return `queue:${this.name}:ready`;
  }

  private async getBullmqQueue() {
    if (!this.bullmqQueue) {
      this.bullmqQueue = new Queue(this.name, { connection: redis });
    }
    return this.bullmqQueue;
  }

  async add(name: string, data: T, options: FallbackJobOptions = {}) {
    if ((await getQueueMode()) === "bullmq") {
      return (await this.getBullmqQueue()).add(name, data, options as JobsOptions);
    }

    const envelope: FallbackEnvelope<T> = {
      name,
      data,
      options,
      attemptsMade: 0
    };

    if ((options.delay ?? 0) > 0) {
      const delay = options.delay ?? 0;
      const timer = setTimeout(() => {
        void redis.rpush(this.listKey, JSON.stringify(envelope));
      }, delay);
      timer.unref?.();
      return;
    }

    await redis.rpush(this.listKey, JSON.stringify(envelope));
  }

  async getJobCounts(...states: QueueCountName[]) {
    if ((await getQueueMode()) === "bullmq") {
      return (await this.getBullmqQueue()).getJobCounts(...states);
    }

    const waiting = await redis.llen(this.listKey);
    return {
      waiting,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: 0
    };
  }
}

export const queues = {
  confirmations: new QueueFacade(queueNames.confirmations),
  binance: new QueueFacade(queueNames.binance),
  blockchain: new QueueFacade(queueNames.blockchain),
  webhooks: new QueueFacade(queueNames.webhooks),
  settlements: new QueueFacade(queueNames.settlements)
};
