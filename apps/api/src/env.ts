import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

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

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  WS_PORT: z.coerce.number().default(4001),
  WORKER_PORT: z.coerce.number().default(4002),
  DATABASE_URL: z.string().min(1),
  DATABASE_URL_POOLED: z.string().min(1).optional(),
  DATABASE_READ_URL: z.string().min(1).optional(),
  PGPOOL_MAX: z.coerce.number().int().positive().optional(),
  PGPOOL_MIN: z.coerce.number().int().nonnegative().optional(),
  PGPOOL_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  PGPOOL_CONN_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  REDIS_URL: z.string().min(1),
  REDIS_CLUSTER_NODES: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  APP_BASE_URL: z.string().url(),
  WEBHOOK_SIGNING_SECRET: z.string().min(16),
  ENCRYPTION_KEY: z.string().min(32),
  COOKIE_DOMAIN: z.string().default("localhost"),
  PRICE_ORACLE_BASE_URL: z.string().url().optional(),
  BINANCE_API_KEY: z.string().optional(),
  BINANCE_API_SECRET: z.string().optional(),
  BINANCE_BASE_URL: z.string().url().optional(),
  TRONGRID_BASE_URL: z.string().url().optional(),
  ETHEREUM_RPC_URL: z.string().url().optional(),
  SOLANA_RPC_URL: z.string().url().optional(),
  WS_NODE_ID: z.string().optional(),
  WORKER_NAME: z.string().optional()
});

export const env = schema.parse(process.env);
