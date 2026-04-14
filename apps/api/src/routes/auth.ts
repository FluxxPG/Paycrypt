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
  }>(
    "select id, password_hash, role, merchant_id from users where email = $1 limit 1",
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

  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });

  const responsePayload = { accessToken, user: { id: user.id, role: user.role, merchantId: user.merchant_id } };
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
    const responsePayload = { accessToken };
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
  res.clearCookie("refresh_token");
  res.json({ success: true });
});

authRouter.get("/me", requireJwt, async (req: AuthenticatedRequest, res) => {
  res.json({ user: req.actor });
});
