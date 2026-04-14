import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import Redis from "ioredis";
import { Server } from "socket.io";
import type { RealtimePaymentEvent } from "@cryptopay/shared";
import { Pool } from "pg";

config();

const wsPort = Number(process.env.WS_PORT ?? 4001);
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null
});
const instanceId = randomUUID();
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const wsNodeId = process.env.WS_NODE_ID ?? instanceId;

const sendJson = (statusCode: number, payload: Record<string, unknown>, res: ServerResponse<IncomingMessage>) => {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
};

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    return sendJson(200, { ok: true, service: "ws" }, res);
  }

  if (req.method === "GET" && req.url === "/ready") {
    try {
      await redis.ping();
      return sendJson(200, { ok: true, redis: "connected" }, res);
    } catch (error) {
      return sendJson(
        503,
        {
          ok: false,
          redis: "unavailable",
          message: error instanceof Error ? error.message : "Readiness check failed"
        },
        res
      );
    }
  }

  return sendJson(404, { ok: false, message: "Not found" }, res);
});

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const reportHealth = async () => {
  try {
    const start = Date.now();
    await redis.ping();
    const latencyMs = Date.now() - start;
    await db.query(
      `insert into ws_health (node_id, clients_connected, latency_ms, last_seen_at)
       values ($1,$2,$3,now())
       on conflict (node_id) do update set
         clients_connected = excluded.clients_connected,
         latency_ms = excluded.latency_ms,
         last_seen_at = now()`,
      [wsNodeId, io.engine.clientsCount, latencyMs]
    );
  } catch (error) {
    console.error("Failed to report WS health", error);
  }
};

io.on("connection", (socket) => {
  socket.on("merchant:join", (merchantId: string) => {
    socket.join(`merchant:${merchantId}`);
  });

  socket.on("payment:join", (paymentId: string) => {
    socket.join(`payment:${paymentId}`);
  });
});

const subscriber = redis.duplicate();
void subscriber.subscribe("payments");
subscriber.on("message", (_channel, message) => {
  try {
    const envelope = JSON.parse(message) as { originId: string; event: RealtimePaymentEvent };
    if (envelope.originId === instanceId) {
      return;
    }

    const event = envelope.event;
    io.to(`merchant:${event.merchantId}`).emit(event.type, event);
    io.to(`payment:${event.paymentId}`).emit(event.type, event);
  } catch (error) {
    console.error("Failed to process realtime payload", error);
  }
});

server.listen(wsPort, () => {
  console.log(`Realtime server listening on ${wsPort}`);
});

const shutdown = async (signal: string) => {
  console.log(`${signal} received, closing realtime server`);
  await new Promise<void>((resolve) => {
    io.close(() => resolve());
  }).catch((error) => {
    console.error("Failed to close websocket server", error);
  });
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  }).catch((error) => {
    console.error("Failed to close HTTP server", error);
  });
  await subscriber.quit().catch((error) => {
    console.error("Failed to close redis subscriber", error);
  });
  await redis.quit().catch((error) => {
    console.error("Failed to close redis connection", error);
  });
  await db.end().catch((error) => {
    console.error("Failed to close DB pool", error);
  });
  process.exit(0);
};

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

setInterval(() => {
  void reportHealth();
}, 15000);
