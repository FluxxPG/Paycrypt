import { query } from "./db.js";

export type CommercePlatform = "shopify" | "woocommerce" | "wordpress" | "opencart";

const allowedPlatforms: CommercePlatform[] = ["shopify", "woocommerce", "wordpress", "opencart"];

const assertPlatform = (platform: string): CommercePlatform => {
  if (!allowedPlatforms.includes(platform as CommercePlatform)) {
    throw new Error("Unsupported platform");
  }
  return platform as CommercePlatform;
};

export const listMerchantIntegrations = async (merchantId: string) => {
  const result = await query(
    `select id, merchant_id, platform, store_domain, store_name, external_store_id, status, capabilities, last_sync_at, metadata, created_at, updated_at
     from platform_connections
     where merchant_id = $1
     order by updated_at desc`,
    [merchantId]
  );
  return result.rows;
};

export const connectMerchantIntegration = async (merchantId: string, input: { platform: string; storeDomain: string; storeName?: string }) => {
  const platform = assertPlatform(input.platform);
  const storeDomain = input.storeDomain.trim().toLowerCase();
  if (!storeDomain) throw new Error("Store domain is required");

  const result = await query(
    `insert into platform_connections (
       merchant_id, platform, store_domain, store_name, external_store_id, status, capabilities, metadata, last_sync_at, created_at, updated_at
     ) values (
       $1, $2, $3, $4, $5, 'connected',
       jsonb_build_object('payments', true, 'refunds', true, 'webhooks', true, 'order_sync', true),
       jsonb_build_object('onboarding', 'one_click'),
       now(), now(), now()
     )
     on conflict (merchant_id, platform, store_domain) do update set
       store_name = excluded.store_name,
       external_store_id = excluded.external_store_id,
       status = 'connected',
       updated_at = now()
     returning *`,
    [merchantId, platform, storeDomain, input.storeName?.trim() || storeDomain, `${platform}_${storeDomain.replace(/[^a-z0-9]/g, "_")}`]
  );

  await query(
    `insert into integration_sync_logs (connection_id, merchant_id, event_type, status, message, payload, created_at)
     values ($1, $2, 'connection.created', 'success', 'Store connected successfully', $3::jsonb, now())`,
    [result.rows[0].id, merchantId, JSON.stringify({ platform, storeDomain })]
  );

  return result.rows[0];
};

export const syncMerchantIntegration = async (merchantId: string, connectionId: string) => {
  const result = await query(
    `update platform_connections
     set status = 'syncing', updated_at = now()
     where id = $1 and merchant_id = $2
     returning *`,
    [connectionId, merchantId]
  );
  if (!result.rows[0]) {
    return null;
  }
  await query(
    `update platform_connections
     set status = 'connected', last_sync_at = now(), updated_at = now()
     where id = $1 and merchant_id = $2`,
    [connectionId, merchantId]
  );
  await query(
    `insert into integration_sync_logs (connection_id, merchant_id, event_type, status, message, payload, created_at)
     values ($1, $2, 'sync.manual', 'success', 'Manual sync completed', '{}'::jsonb, now())`,
    [connectionId, merchantId]
  );
  return { success: true };
};

export const disconnectMerchantIntegration = async (merchantId: string, connectionId: string) => {
  const result = await query(
    `update platform_connections
     set status = 'disconnected', updated_at = now()
     where id = $1 and merchant_id = $2
     returning id`,
    [connectionId, merchantId]
  );
  if (!result.rows[0]) return null;
  await query(
    `insert into integration_sync_logs (connection_id, merchant_id, event_type, status, message, payload, created_at)
     values ($1, $2, 'connection.disconnected', 'success', 'Store disconnected', '{}'::jsonb, now())`,
    [connectionId, merchantId]
  );
  return { success: true };
};

export const listIntegrationsForAdmin = async () => {
  const [summary, connections] = await Promise.all([
    query(
      `select platform,
              count(*)::int as total,
              count(*) filter (where status = 'connected')::int as connected,
              count(*) filter (where status = 'error')::int as errored,
              max(last_sync_at) as last_sync_at
       from platform_connections
       group by platform
       order by platform`
    ),
    query(
      `select c.*, m.name as merchant_name, m.email as merchant_email
       from platform_connections c
       join merchants m on m.id = c.merchant_id
       order by c.updated_at desc`
    )
  ]);
  return { summary: summary.rows, connections: connections.rows };
};

export const updateIntegrationStatusForAdmin = async (
  connectionId: string,
  status: "connected" | "suspended" | "error" | "disconnected"
) => {
  const result = await query(
    `update platform_connections
     set status = $2, updated_at = now()
     where id = $1
     returning *`,
    [connectionId, status]
  );
  return result.rows[0] ?? null;
};

