"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { getApiBaseUrl, getWsBaseUrl } from "../lib/runtime-config";
import { Badge } from "./ui/badge";

export const RealtimePayment = ({
  paymentId,
  merchantId,
  initialStatus,
  successUrl,
  cancelUrl
}: {
  paymentId: string;
  merchantId: string;
  initialStatus: string;
  successUrl?: string;
  cancelUrl?: string;
}) => {
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    const realtimeBaseUrl = getWsBaseUrl();
    const usePollingOnly =
      /^https:\/\/.*cloudfront\.net$/i.test(realtimeBaseUrl) ||
      process.env.NEXT_PUBLIC_WS_TRANSPORT === "polling";

    const socket = io(realtimeBaseUrl, {
      transports: usePollingOnly ? ["polling"] : ["polling", "websocket"],
      upgrade: !usePollingOnly,
      reconnectionAttempts: 5,
      timeout: 10000
    });
    socket.emit("merchant:join", merchantId);
    socket.emit("payment:join", paymentId);

    const update = (payload: { status: string }) => {
      setStatus(payload.status);
      if (payload.status === "confirmed" && successUrl) {
        window.location.assign(successUrl);
      }
      if ((payload.status === "failed" || payload.status === "expired") && cancelUrl) {
        window.location.assign(cancelUrl);
      }
    };
    socket.on("payment.pending", update);
    socket.on("payment.confirmed", update);
    socket.on("payment.failed", update);
    socket.on("payment.expired", update);

    if (!usePollingOnly) {
      socket.on("connect_error", async () => {
        try {
          const response = await fetch(`${getApiBaseUrl()}/public/payments/${paymentId}`, {
            cache: "no-store"
          });
          if (!response.ok) return;
          const payload = (await response.json()) as { status?: string };
          if (payload.status) update({ status: payload.status });
        } catch {
          // Ignore polling fallback errors here; the UI will keep its current state.
        }
      });
    }

    return () => {
      socket.disconnect();
    };
  }, [merchantId, paymentId, successUrl, cancelUrl]);

  return <Badge className="capitalize">{status}</Badge>;
};
