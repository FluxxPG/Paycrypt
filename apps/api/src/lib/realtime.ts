import { randomUUID } from "node:crypto";
import type { RealtimePaymentEvent } from "@cryptopay/shared";
import { redis } from "./redis.js";

const instanceId = randomUUID();

export const emitPaymentEvent = (event: RealtimePaymentEvent) => {
  void redis.publish("payments", JSON.stringify({ originId: instanceId, event }));
};
