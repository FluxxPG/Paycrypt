import { config } from "dotenv";
import { z } from "zod";

config();

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
  PRICE_ORACLE_BASE_URL: z.string().url().optional()
});

export const env = schema.parse(process.env);
