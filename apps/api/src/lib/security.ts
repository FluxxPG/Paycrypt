import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../env.js";

export interface JwtPayload {
  sub: string;
  merchantId: string;
  role: "merchant" | "admin" | "super_admin";
}

export const signAccessToken = (payload: JwtPayload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: "30m" });

export const signRefreshToken = (payload: JwtPayload) =>
  jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: "30d" });

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;

export const verifyRefreshToken = (token: string) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;

export const hashValue = async (value: string) => bcrypt.hash(value, 12);
export const compareHash = async (value: string, hashed: string) => bcrypt.compare(value, hashed);
export const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");
export const hmacSign = (payload: string) =>
  crypto.createHmac("sha256", env.WEBHOOK_SIGNING_SECRET).update(payload).digest("hex");
export const hmacSignWithSecret = (payload: string, secret: string) =>
  crypto.createHmac("sha256", secret).update(payload).digest("hex");

const encryptionKey = crypto.scryptSync(env.ENCRYPTION_KEY, "cryptopay-webhook", 32);

export const encryptSecret = (value: string) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
};

export const decryptSecret = (value: string) => {
  const payload = Buffer.from(value, "base64");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const data = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
};
