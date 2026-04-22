import "dotenv/config";
import dns from "node:dns";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const originalLookup = dns.lookup.bind(dns);
dns.lookup = (hostname, options, callback) => {
  if (typeof options === "function") {
    callback = options;
    options = {};
  }

  const normalized = typeof options === "number" ? { family: options } : { ...(options ?? {}) };
  if (typeof hostname === "string" && hostname.includes(".supabase.co")) {
    normalized.family = 4;
  }

  return originalLookup(hostname, normalized, callback);
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../supabase/migrations");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(
    process.env.DATABASE_URL.includes(".supabase.co") || process.env.DATABASE_URL.includes("sslmode=")
      ? { ssl: { rejectUnauthorized: false } }
      : {}
  )
});

const ensureMigrationsTable = async () => {
  await db.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `);
};

const readMigrationFiles = async () => {
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
};

const main = async () => {
  await ensureMigrationsTable();

  const existing = await db.query("select id from schema_migrations");
  const applied = new Set(existing.rows.map((row) => row.id));
  const files = await readMigrationFiles();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`Skipping ${file}`);
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    const client = await db.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (id) values ($1)", [file]);
      await client.query("commit");
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
};

main()
  .catch((error) => {
    console.error("Migration failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
