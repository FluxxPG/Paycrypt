import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "../env.js";

export const db = new Pool({
  connectionString: env.DATABASE_URL
});

export const query = async <T extends QueryResultRow>(text: string, params: unknown[] = []) => {
  const result = await db.query<T>(text, params);
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
