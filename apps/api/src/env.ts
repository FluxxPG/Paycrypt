import { config } from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const repoRoot = path.resolve(currentDir, "../../../");
const envCandidates = [
  path.join(repoRoot, ".env"),
  path.join(repoRoot, ".env.local"),
  path.join(process.cwd(), ".env"),
  path.join(process.cwd(), ".env.local")
];

for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    config({ path: envPath, override: false });
  }
}

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  WS_PORT: z.coerce.number().default(4001),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
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
