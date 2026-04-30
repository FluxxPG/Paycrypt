import { loadRepoEnv } from "./load-env.mjs";
import dns from "node:dns";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

loadRepoEnv();

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

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ...(
    process.env.DATABASE_URL?.includes(".supabase.co") || process.env.DATABASE_URL?.includes("sslmode=")
      ? { ssl: { rejectUnauthorized: false } }
      : {}
  )
});

const merchantId = "mrc_demo";
const adminMerchantId = "mrc_admin";

const hash = (value) => bcrypt.hash(value, 12);

async function main() {
  const merchantPassword = await hash("ChangeMe123!");
  const adminPassword = await hash("AdminChangeMe123!");

  await db.query("begin");

  await db.query(
    `insert into merchants (id, name, slug, email, status, custodial_enabled, non_custodial_enabled)
     values
     ($1, 'Nebula Commerce', 'nebula-commerce', 'owner@nebula.dev', 'active', true, false),
     ($2, 'Platform Admin', 'platform-admin', 'admin@cryptopay.dev', 'active', true, false)
     on conflict (id) do update set
       name = excluded.name,
       slug = excluded.slug,
       email = excluded.email,
       status = excluded.status,
       updated_at = now()`,
    [merchantId, adminMerchantId]
  );

  const merchantPair = [merchantId, adminMerchantId];
  await db.query(`delete from api_keys where merchant_id in ($1, $2)`, merchantPair);
  await db.query(`delete from wallets where merchant_id in ($1, $2)`, merchantPair);
  await db.query(`delete from payment_links where merchant_id in ($1, $2)`, merchantPair);
  await db.query(`delete from transactions where merchant_id in ($1, $2)`, merchantPair);
  await db.query(`delete from settlements where merchant_id in ($1, $2)`, merchantPair);
  await db.query(`delete from payments where merchant_id in ($1, $2)`, merchantPair);
  await db.query(`delete from subscriptions where merchant_id in ($1, $2)`, merchantPair);
  await db.query(`delete from billing_invoices where merchant_id in ($1, $2)`, merchantPair);
  await db.query(`delete from usage_logs where merchant_id in ($1, $2)`, merchantPair);
  await db.query(`delete from webhook_logs where merchant_id in ($1, $2)`, merchantPair);
  await db.query(`delete from webhook_endpoints where merchant_id in ($1, $2)`, merchantPair);
  await db.query(`delete from non_custodial_wallet_verifications where merchant_id in ($1, $2)`, merchantPair);

  await db.query(
    `insert into users (
      id,
      merchant_id,
      full_name,
      email,
      password_hash,
      role,
      must_change_password,
      password_setup_completed_at
    )
     values
     ($1, $2, $3, $4, $5, 'merchant', false, now()),
     ($6, $7, $8, $9, $10, 'super_admin', false, now())
     on conflict (email) do update set
       merchant_id = excluded.merchant_id,
       full_name = excluded.full_name,
       password_hash = excluded.password_hash,
       role = excluded.role,
       must_change_password = excluded.must_change_password,
       password_setup_completed_at = excluded.password_setup_completed_at`,
    [
      `usr_${nanoid(12)}`,
      merchantId,
      "Nebula Commerce Owner",
      "owner@nebula.dev",
      merchantPassword,
      `usr_${nanoid(12)}`,
      adminMerchantId,
      "Platform Admin",
      "admin@cryptopay.dev",
      adminPassword
    ]
  );

  await db.query("commit");

  console.log("Seed complete");
  console.log("Merchant login: owner@nebula.dev / ChangeMe123!");
  console.log("Admin login: admin@cryptopay.dev / AdminChangeMe123!");
}

main()
  .catch(async (error) => {
    await db.query("rollback").catch(() => undefined);
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.end();
  });
