import type { NextFunction, Request, Response } from "express";
import { query } from "./db.js";
import { sendError } from "./http.js";
import { redis } from "./redis.js";
import { recordAuthResult, recordIdempotencyHit, recordRateLimitHit } from "./telemetry.js";
import { compareHash, verifyAccessToken, verifyRefreshToken } from "./security.js";
import { logUsage } from "./services.js";

export interface AuthenticatedRequest extends Request {
  actor?: {
    userId: string;
    merchantId: string;
    role: "merchant" | "admin" | "super_admin" | "employer";
    requiresPasswordSetup: boolean;
  };
  apiKey?: {
    keyId: string;
    merchantId: string;
    scopes: string[];
    rateLimitPerMinute: number;
  };
}

const loadActorForUser = async (userId: string) => {
  const userResult = await query<{
    merchant_id: string;
    role: "merchant" | "admin" | "super_admin" | "employer";
    must_change_password: boolean;
  }>(
    "select merchant_id, role, must_change_password from users where id = $1 limit 1",
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) {
    return null;
  }
  return {
    userId,
    merchantId: user.merchant_id,
    role: user.role,
    requiresPasswordSetup: Boolean(user.must_change_password)
  };
};

export const requireJwt = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  const bearerToken = header?.startsWith("Bearer ") ? header.replace("Bearer ", "").trim() : null;
  const refreshToken =
    typeof (req as Request & { cookies?: Record<string, unknown> }).cookies?.refresh_token === "string"
      ? String((req as Request & { cookies?: Record<string, unknown> }).cookies?.refresh_token)
      : null;

  if (!bearerToken && !refreshToken) {
    return sendError(res, 401, "unauthorized", "Missing bearer token");
  }

  try {
    let userId: string | null = null;

    if (bearerToken) {
      const payload = verifyAccessToken(bearerToken);
      userId = payload.sub;
    } else if (refreshToken) {
      const payload = verifyRefreshToken(refreshToken);
      const tokenResult = await query(
        "select id from refresh_tokens where user_id = $1 and token = $2 and revoked_at is null and expires_at > now() limit 1",
        [payload.sub, refreshToken]
      );
      if (!tokenResult.rows[0]) {
        return sendError(res, 401, "unauthorized", "Invalid or expired refresh token");
      }
      userId = payload.sub;
    }

    if (!userId) {
      return sendError(res, 401, "unauthorized", "Invalid or expired access token");
    }

    const actor = await loadActorForUser(userId);
    if (!actor) {
      return sendError(res, 401, "unauthorized", "Invalid or expired access token");
    }
    req.actor = actor;
    void recordAuthResult("jwt", true).catch((error) => console.error("Failed to record JWT auth telemetry", error));
    next();
  } catch (error) {
    void recordAuthResult("jwt", false).catch((telemetryError) =>
      console.error("Failed to record JWT auth failure telemetry", telemetryError)
    );
    return sendError(res, 401, "unauthorized", "Invalid or expired access token", error);
  }
};

export const requireApiKey = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer sk_live_")) {
    void recordAuthResult("apiKey", false).catch((telemetryError) =>
      console.error("Failed to record API key auth failure telemetry", telemetryError)
    );
    return sendError(res, 401, "unauthorized", "Missing secret API key");
  }

  const token = header.replace("Bearer ", "");
  const result = await query<{
    id: string;
    merchant_id: string;
    key_hash: string;
    scopes: string[];
    rate_limit_per_minute: number;
    is_active: boolean;
  }>(
    "select id, merchant_id, key_hash, scopes, rate_limit_per_minute, is_active from api_keys where key_prefix = $1 and key_type = 'secret' limit 1",
    [token.slice(0, 15)]
  );

  const key = result.rows[0];
  if (!key || !key.is_active) {
    void recordAuthResult("apiKey", false).catch((telemetryError) =>
      console.error("Failed to record API key auth failure telemetry", telemetryError)
    );
    return sendError(res, 401, "unauthorized", "Invalid secret API key");
  }

  const matches = await compareHash(token, key.key_hash);
  if (!matches) {
    void recordAuthResult("apiKey", false).catch((telemetryError) =>
      console.error("Failed to record API key auth failure telemetry", telemetryError)
    );
    return sendError(res, 401, "unauthorized", "Invalid secret API key");
  }

  req.apiKey = {
    keyId: key.id,
    merchantId: key.merchant_id,
    scopes: key.scopes,
    rateLimitPerMinute: key.rate_limit_per_minute
  };
  void recordAuthResult("apiKey", true).catch((telemetryError) =>
    console.error("Failed to record API key auth telemetry", telemetryError)
  );

  res.on("finish", () => {
    if (res.statusCode < 500) {
      void query("update api_keys set last_used_at = now() where id = $1", [key.id]).catch((error) =>
        console.error("Failed to update API key usage timestamp", error)
      );
      void logUsage(key.merchant_id, "api.call", 1).catch((error) =>
        console.error("Failed to log API usage", error)
      );
    }
  });
  next();
};

export const requirePasswordSetupComplete = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.actor?.requiresPasswordSetup) {
    return sendError(
      res,
      403,
      "password_setup_required",
      "Password setup is required before accessing this area"
    );
  }
  next();
};

export const scopeGuard =
  (requiredScope: string) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.apiKey?.scopes.includes(requiredScope)) {
      return sendError(res, 403, "forbidden", `Missing required scope: ${requiredScope}`);
    }
    next();
  };

export const requireAdmin =
  (superOnly = false) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.actor) {
      return sendError(res, 401, "unauthorized", "Missing actor");
    }

    const valid = superOnly
      ? req.actor.role === "super_admin"
      : req.actor.role === "admin" || req.actor.role === "super_admin";

    if (!valid) {
      return sendError(res, 403, "forbidden", "Admin privileges required");
    }

    next();
  };

export const idempotencyGuard = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.method !== "POST") {
    return next();
  }

  const idempotencyKey = req.header("Idempotency-Key");
  if (!idempotencyKey) {
    return next();
  }

  const cacheKey = `idem:${req.path}:${req.apiKey?.merchantId ?? req.actor?.merchantId}:${idempotencyKey}`;
  const existing = await redis.get(cacheKey);
  if (existing) {
    void recordIdempotencyHit().catch((error) => console.error("Failed to record idempotency telemetry", error));
    return res.status(200).json(JSON.parse(existing));
  }

  res.on("finish", async () => {
    const payload = (res.locals.responsePayload ?? null) as unknown;
    if (res.statusCode < 300 && payload) {
      await redis.set(cacheKey, JSON.stringify(payload), "EX", 60 * 60 * 24);
    }
  });

  next();
};

export const redisRateLimit =
  (bucket: string, limit: number | ((req: AuthenticatedRequest) => number), windowSeconds: number) =>
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const keyPart =
      req.apiKey?.keyId ?? req.actor?.userId ?? req.ip ?? "anonymous";
    const resolvedLimit = typeof limit === "function" ? limit(req) : limit;
    const redisKey = `rl:${bucket}:${keyPart}`;
    const value = await redis.incr(redisKey);
    if (value === 1) {
      await redis.expire(redisKey, windowSeconds);
    }
    if (value > resolvedLimit) {
      void recordRateLimitHit().catch((error) => console.error("Failed to record rate limit telemetry", error));
      return sendError(res, 429, "rate_limited", "Too many requests");
    }
    next();
  };
