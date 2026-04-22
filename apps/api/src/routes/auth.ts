import { Router } from "express";
import { env } from "../env.js";
import { query } from "../lib/db.js";
import { sendError } from "../lib/http.js";
import { compareHash, signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/security.js";
import type { AuthenticatedRequest } from "../lib/middleware.js";
import { requireJwt } from "../lib/middleware.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const result = await query<{
    id: string;
    password_hash: string;
    role: "merchant" | "admin" | "super_admin";
    merchant_id: string;
    must_change_password: boolean;
  }>(
    "select id, password_hash, role, merchant_id, must_change_password from users where email = $1 limit 1",
    [email]
  );

  const user = result.rows[0];
  if (!user || !(await compareHash(password, user.password_hash))) {
    return sendError(res, 401, "invalid_credentials", "Email or password is incorrect");
  }

  const payload = { sub: user.id, merchantId: user.merchant_id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  await query(
    "insert into refresh_tokens (user_id, token, expires_at) values ($1,$2, now() + interval '30 day')",
    [user.id, refreshToken]
  );

  const cookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: (env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
    path: "/",
    ...(env.COOKIE_DOMAIN && env.COOKIE_DOMAIN !== "localhost" ? { domain: env.COOKIE_DOMAIN } : {})
  };

  res.cookie("refresh_token", refreshToken, {
    ...cookieOptions
  });

  const responsePayload = {
    accessToken,
    user: {
      id: user.id,
      role: user.role,
      merchantId: user.merchant_id,
      requiresPasswordSetup: Boolean(user.must_change_password)
    }
  };
  res.locals.responsePayload = responsePayload;
  res.json(responsePayload);
});

authRouter.post("/refresh", async (req, res) => {
  const token = req.cookies.refresh_token as string | undefined;
  if (!token) {
    return sendError(res, 401, "missing_refresh_token", "Refresh token cookie missing");
  }

  try {
    const payload = verifyRefreshToken(token);
    const tokenResult = await query(
      "select id from refresh_tokens where user_id = $1 and token = $2 and revoked_at is null and expires_at > now() limit 1",
      [payload.sub, token]
    );
    if (!tokenResult.rows[0]) {
      return sendError(res, 401, "invalid_refresh_token", "Refresh token is invalid");
    }

    const accessToken = signAccessToken(payload);
    const userResult = await query<{ role: "merchant" | "admin" | "super_admin"; merchant_id: string; must_change_password: boolean }>(
      "select role, merchant_id, must_change_password from users where id = $1 limit 1",
      [payload.sub]
    );
    const user = userResult.rows[0];
    const responsePayload = {
      accessToken,
      user: user
        ? {
            id: payload.sub,
            role: user.role,
            merchantId: user.merchant_id,
            requiresPasswordSetup: Boolean(user.must_change_password)
          }
        : undefined
    };
    res.locals.responsePayload = responsePayload;
    res.json(responsePayload);
  } catch (error) {
    return sendError(res, 401, "invalid_refresh_token", "Refresh token is invalid", error);
  }
});

authRouter.post("/logout", async (req, res) => {
  const token = req.cookies.refresh_token as string | undefined;
  if (token) {
    await query("update refresh_tokens set revoked_at = now() where token = $1", [token]);
  }
  res.clearCookie("refresh_token", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: (env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
    path: "/",
    ...(env.COOKIE_DOMAIN && env.COOKIE_DOMAIN !== "localhost" ? { domain: env.COOKIE_DOMAIN } : {})
  });
  res.json({ success: true });
});

authRouter.post("/setup-password", requireJwt, async (req: AuthenticatedRequest, res) => {
  const { password, confirmPassword } = req.body as { password: string; confirmPassword: string };
  if (!password || password.length < 10) {
    return sendError(res, 400, "invalid_password", "Password must be at least 10 characters long");
  }
  if (password !== confirmPassword) {
    return sendError(res, 400, "password_mismatch", "Password and confirm password must match");
  }

  const passwordHash = await import("../lib/security.js").then(({ hashValue }) => hashValue(password));
  await query(
    `update users
     set password_hash = $2,
         must_change_password = false,
         password_setup_completed_at = now()
     where id = $1`,
    [req.actor!.userId, passwordHash]
  );

  await query("update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null", [req.actor!.userId]);

  const payload = { sub: req.actor!.userId, merchantId: req.actor!.merchantId, role: req.actor!.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  await query(
    "insert into refresh_tokens (user_id, token, expires_at) values ($1,$2, now() + interval '30 day')",
    [req.actor!.userId, refreshToken]
  );

  const cookieOptions = {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: (env.NODE_ENV === "production" ? "none" : "lax") as "none" | "lax",
    path: "/",
    ...(env.COOKIE_DOMAIN && env.COOKIE_DOMAIN !== "localhost" ? { domain: env.COOKIE_DOMAIN } : {})
  };

  res.cookie("refresh_token", refreshToken, cookieOptions);
  const responsePayload = {
    accessToken,
    user: {
      id: req.actor!.userId,
      role: req.actor!.role,
      merchantId: req.actor!.merchantId,
      requiresPasswordSetup: false
    }
  };
  res.locals.responsePayload = responsePayload;
  res.json(responsePayload);
});

authRouter.get("/me", requireJwt, async (req: AuthenticatedRequest, res) => {
  res.json({ user: req.actor });
});
