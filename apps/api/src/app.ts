import "express-async-errors";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { ZodError } from "zod";
import { buildRouter } from "./routes/index.js";
import { sendError } from "./lib/http.js";
import { AppError } from "./lib/errors.js";
import { query } from "./lib/db.js";
import { redis } from "./lib/redis.js";
import { recordHttpRequest } from "./lib/telemetry.js";

export const createApp = () => {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());

  app.get("/", (_req, res) => {
    res.json({
      ok: true,
      service: "paycrypt-api",
      status: "online",
      endpoints: {
        health: "/health",
        ready: "/ready"
      }
    });
  });

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/ready", async (_req, res) => {
    try {
      await Promise.all([query("select 1"), redis.ping()]);
      res.json({
        ok: true,
        database: "connected",
        redis: "connected"
      });
    } catch (error) {
      res.status(503).json({
        ok: false,
        database: "unavailable",
        redis: "unavailable",
        message: error instanceof Error ? error.message : "Readiness check failed"
      });
    }
  });

  app.use((req, res, next) => {
    if (req.path === "/" || req.path === "/health" || req.path === "/ready") {
      return next();
    }

    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      void recordHttpRequest(res.statusCode, durationMs).catch((error) =>
        console.error("Failed to record http telemetry", error)
      );
    });

    next();
  });

  app.use(buildRouter());

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof AppError) {
      return sendError(res, error.status, error.code, error.message, error.details);
    }
    if (error instanceof ZodError) {
      return sendError(res, 400, "validation_error", "Request validation failed", error.flatten());
    }
    console.error(error);
    sendError(res, 500, "internal_error", "Unexpected server error");
  });

  return app;
};