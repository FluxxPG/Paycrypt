import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./env.js";
import { db } from "./lib/db.js";
import { redis } from "./lib/redis.js";

const app = createApp();
const server = createServer(app);

server.listen(env.PORT, () => {
  console.log(`API server listening on ${env.PORT}`);
});

const shutdown = async (signal: string) => {
  console.log(`${signal} received, closing API server`);
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
  await Promise.allSettled([db.end(), redis.quit()]);
  process.exit(0);
};

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});
