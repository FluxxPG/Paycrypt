import { query, withTransaction } from "./db.js";
import { AppError } from "./errors.js";
import { hashValue, hmacSignWithSecret } from "./security.js";
import { nanoid } from "nanoid";

export const generateClientId = () => `sso_${nanoid(16)}`;
export const generateClientSecret = () => `sso_secret_${nanoid(32)}`;

export const createSSOApplication = async (input: {
  appName: string;
  appType: "shopify" | "woocommerce" | "wordpress" | "opencart" | "custom";
  merchantId?: string;
  redirectUris: string[];
  scopes: string[];
  metadata?: Record<string, unknown>;
}) => {
  const clientId = generateClientId();
  const clientSecret = generateClientSecret();
  const clientSecretHash = await hashValue(clientSecret);

  const result = await query<{ id: string }>(
    `insert into sso_applications (app_name, app_type, client_id, client_secret_hash, redirect_uris, scopes, merchant_id, metadata)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning id`,
    [
      input.appName,
      input.appType,
      clientId,
      clientSecretHash,
      input.redirectUris,
      input.scopes,
      input.merchantId ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );

  return {
    id: result.rows[0].id,
    clientId,
    clientSecret
  };
};

export const getSSOApplication = async (clientId: string) => {
  const result = await query<{
    id: string;
    app_name: string;
    app_type: string;
    client_id: string;
    redirect_uris: string[];
    scopes: string[];
    is_active: boolean;
    merchant_id: string | null;
  }>(
    `select id, app_name, app_type, client_id, redirect_uris, scopes, is_active, merchant_id
     from sso_applications
     where client_id = $1 and is_active = true
     limit 1`,
    [clientId]
  );

  return result.rows[0] ?? null;
};

export const generateAuthorizationCode = async (input: {
  clientId: string;
  merchantId: string;
  userId: string;
  redirectUri: string;
  scopes: string[];
}) => {
  const code = `auth_${nanoid(32)}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await query(
    `insert into sso_authorization_codes (code, client_id, merchant_id, user_id, redirect_uri, scopes, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [code, input.clientId, input.merchantId, input.userId, input.redirectUri, input.scopes, expiresAt]
  );

  return code;
};

export const validateAuthorizationCode = async (code: string, clientId: string) => {
  const result = await query<{
    id: string;
    code: string;
    client_id: string;
    merchant_id: string;
    user_id: string;
    redirect_uri: string;
    scopes: string[];
    expires_at: string;
    used_at: string | null;
  }>(
    `select * from sso_authorization_codes
     where code = $1 and client_id = $2 and used_at is null and expires_at > now()
     limit 1`,
    [code, clientId]
  );

  return result.rows[0] ?? null;
};

export const generateAccessToken = async (input: {
  clientId: string;
  merchantId: string;
  userId?: string;
  scopes: string[];
}) => {
  const token = `access_${nanoid(32)}`;
  const tokenHash = await hashValue(token);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  const result = await query<{ id: string }>(
    `insert into sso_access_tokens (token_hash, client_id, merchant_id, user_id, scopes, expires_at)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [tokenHash, input.clientId, input.merchantId, input.userId ?? null, input.scopes, expiresAt]
  );

  return {
    accessToken: token,
    accessTokenId: result.rows[0].id,
    expiresAt
  };
};

export const generateRefreshToken = async (input: {
  accessTokenId: string;
  clientId: string;
  merchantId: string;
  userId?: string;
}) => {
  const token = `refresh_${nanoid(32)}`;
  const tokenHash = await hashValue(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const result = await query<{ id: string }>(
    `insert into sso_refresh_tokens (token_hash, access_token_id, client_id, merchant_id, user_id, expires_at)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [tokenHash, input.accessTokenId, input.clientId, input.merchantId, input.userId ?? null, expiresAt]
  );

  return {
    refreshToken: token,
    refreshTokenId: result.rows[0].id,
    expiresAt
  };
};

export const validateAccessToken = async (token: string) => {
  const tokenHash = await hashValue(token);

  const result = await query<{
    id: string;
    client_id: string;
    merchant_id: string;
    user_id: string | null;
    scopes: string[];
    expires_at: string;
    revoked_at: string | null;
  }>(
    `select * from sso_access_tokens
     where token_hash = $1 and revoked_at is null and expires_at > now()
     limit 1`,
    [tokenHash]
  );

  return result.rows[0] ?? null;
};

export const revokeAccessToken = async (tokenId: string) => {
  await query(
    `update sso_access_tokens set revoked_at = now() where id = $1`,
    [tokenId]
  );
};

export const revokeRefreshToken = async (tokenId: string) => {
  await query(
    `update sso_refresh_tokens set revoked_at = now() where id = $1`,
    [tokenId]
  );
};

export const refreshAccessToken = async (refreshToken: string) => {
  const tokenHash = await hashValue(refreshToken);

  const result = await query<{
    id: string;
    access_token_id: string;
    client_id: string;
    merchant_id: string;
    user_id: string | null;
    expires_at: string;
    revoked_at: string | null;
  }>(
    `select * from sso_refresh_tokens
     where token_hash = $1 and revoked_at is null and expires_at > now()
     limit 1`,
    [tokenHash]
  );

  if (!result.rows[0]) {
    throw new AppError(401, "invalid_refresh_token", "Invalid or expired refresh token");
  }

  const refreshRecord = result.rows[0];

  // Revoke old tokens
  await revokeAccessToken(refreshRecord.access_token_id);
  await revokeRefreshToken(refreshRecord.id);

  // Generate new tokens
  const accessTokenResult = await generateAccessToken({
    clientId: refreshRecord.client_id,
    merchantId: refreshRecord.merchant_id,
    userId: refreshRecord.user_id ?? undefined,
    scopes: []
  });

  const refreshTokenResult = await generateRefreshToken({
    accessTokenId: accessTokenResult.accessTokenId,
    clientId: refreshRecord.client_id,
    merchantId: refreshRecord.merchant_id,
    userId: refreshRecord.user_id ?? undefined
  });

  return {
    accessToken: accessTokenResult.accessToken,
    refreshToken: refreshTokenResult.refreshToken,
    expiresAt: accessTokenResult.expiresAt
  };
};

export const createSSOSession = async (input: {
  merchantId: string;
  userId: string;
  clientId?: string;
  ipAddress?: string;
  userAgent?: string;
}) => {
  const sessionId = `session_${nanoid(32)}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  const result = await query<{ id: string }>(
    `insert into sso_sessions (session_id, merchant_id, user_id, client_id, ip_address, user_agent, expires_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning id`,
    [sessionId, input.merchantId, input.userId, input.clientId ?? null, input.ipAddress ?? null, input.userAgent ?? null, expiresAt]
  );

  return {
    sessionId,
    expiresAt
  };
};

export const validateSSOSession = async (sessionId: string) => {
  const result = await query<{
    id: string;
    merchant_id: string;
    user_id: string;
    client_id: string | null;
    expires_at: string;
  }>(
    `select * from sso_sessions
     where session_id = $1 and expires_at > now()
     limit 1`,
    [sessionId]
  );

  if (result.rows[0]) {
    // Update last activity
    await query(
      `update sso_sessions set last_activity_at = now() where session_id = $1`,
      [sessionId]
    );
  }

  return result.rows[0] ?? null;
};

export const revokeSSOSession = async (sessionId: string) => {
  await query(
    `delete from sso_sessions where session_id = $1`,
    [sessionId]
  );
};

export const listSSOApplications = async (merchantId?: string) => {
  let queryStr = `select id, app_name, app_type, client_id, redirect_uris, scopes, is_active, merchant_id, created_at
                 from sso_applications where is_active = true`;
  const params: unknown[] = [];

  if (merchantId) {
    queryStr += ` and merchant_id = $1`;
    params.push(merchantId);
  }

  queryStr += ` order by created_at desc`;

  return query(queryStr, params).then((res) => res.rows);
};

export const deleteSSOApplication = async (clientId: string) => {
  await query(
    `update sso_applications set is_active = false where client_id = $1`,
    [clientId]
  );
};
