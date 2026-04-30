import dns from "node:dns";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "../env.js";

const originalLookup = dns.lookup.bind(dns);
// Supabase can resolve AAAA first, which breaks on IPv4-only EC2 hosts.
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

const writeDatabaseUrl = env.DATABASE_URL_POOLED ?? env.DATABASE_URL;
const readDatabaseUrl = env.DATABASE_READ_URL ?? writeDatabaseUrl;

const needsSsl = writeDatabaseUrl.includes(".supabase.co") || writeDatabaseUrl.includes("sslmode=");

const poolConfig = {
  max: env.PGPOOL_MAX ?? 50,
  min: env.PGPOOL_MIN ?? 0,
  idleTimeoutMillis: env.PGPOOL_IDLE_TIMEOUT_MS ?? 30_000,
  connectionTimeoutMillis: env.PGPOOL_CONN_TIMEOUT_MS ?? 2_000
};

export const db = new Pool({
  connectionString: writeDatabaseUrl,
  ...poolConfig,
  ...(needsSsl
    ? {
        // Supabase direct Postgres connections require TLS; some Windows cert stores do not trust the chain by default.
        ssl: { rejectUnauthorized: false }
      }
    : {})
});

export const dbRead =
  readDatabaseUrl === writeDatabaseUrl
    ? db
    : new Pool({
        connectionString: readDatabaseUrl,
        ...poolConfig,
        ...(needsSsl
          ? {
              ssl: { rejectUnauthorized: false }
            }
          : {})
      });

export const query = async <T extends QueryResultRow>(text: string, params: unknown[] = []) => {
  const result = await db.query<T>(text, params);
  return result;
};

export const queryRead = async <T extends QueryResultRow>(text: string, params: unknown[] = []) => {
  const result = await dbRead.query<T>(text, params);
  return result;
};

export const withTransaction = async <T>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await db.connect();
  try {
    await client.query("begin");
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};
