import type { Response } from "express";
import type { ApiErrorPayload } from "@cryptopay/shared";

export const sendError = (
  res: Response,
  status: number,
  error: string,
  message: string,
  details?: unknown
) => {
  const payload: ApiErrorPayload = { error, message, details };
  return res.status(status).json(payload);
};
