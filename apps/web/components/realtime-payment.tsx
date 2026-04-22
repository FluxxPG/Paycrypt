"use client";

import { useEffect, useState } from "react";
import { io } from "socket.io-client";
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
    const realtimeBaseUrl =
      process.env.NEXT_PUBLIC_WS_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4001";
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

    return () => {
      socket.disconnect();
    };
  }, [merchantId, paymentId, successUrl, cancelUrl]);

  return <Badge className="capitalize">{status}</Badge>;
};
