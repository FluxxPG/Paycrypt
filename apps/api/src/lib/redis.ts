import Redis from "ioredis";
import { env } from "../env.js";

const parseClusterNodes = (value: string) => {
  return value
    .split(",")
    .map((node) => node.trim())
    .filter(Boolean)
    .map((node) => {
      const [host, port] = node.split(":");
      return { host, port: port ? Number(port) : 6379 };
    });
};

export const redis = env.REDIS_CLUSTER_NODES
  ? new Redis.Cluster(parseClusterNodes(env.REDIS_CLUSTER_NODES), {
      scaleReads: "slave",
      redisOptions: {
        maxRetriesPerRequest: null
      }
    })
  : new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null
    });
