"use client";

import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { RealtimeEventName, RealtimePaymentEvent } from "@cryptopay/shared";
import { getWsBaseUrl } from "../lib/runtime-config";
import { Badge } from "./ui/badge";

type Props = {
  paymentId: string;
  merchantId: string;
  initialStatus: string;
  paymentMethod?: "crypto" | "upi";
};

const paymentEvents: RealtimeEventName[] = [
  "payment.created",
  "payment.pending",
  "payment.confirmed",
  "payment.failed",
  "payment.expired"
];

export const RealtimePayment = ({ paymentId, merchantId, initialStatus, paymentMethod = "crypto" }: Props) => {
  const [status, setStatus] = useState(initialStatus);

  useEffect(() => {
    const socket: Socket = io(getWsBaseUrl(), {
      transports: ["websocket", "polling"],
      reconnection: true
    });

    const handleEvent = (event: RealtimePaymentEvent) => {
      if (event.paymentId !== paymentId) {
        return;
      }
      setStatus(event.status);
    };

    socket.on("connect", () => {
      socket.emit("merchant:join", merchantId);
      socket.emit("payment:join", paymentId);
    });

    for (const eventName of paymentEvents) {
      socket.on(eventName, handleEvent);
    }

    return () => {
      for (const eventName of paymentEvents) {
        socket.off(eventName, handleEvent);
      }
      socket.disconnect();
    };
  }, [merchantId, paymentId]);

  const statusColor = (value: string) => {
    switch (value) {
      case "confirmed":
        return "text-emerald-400";
      case "failed":
        return "text-rose-400";
      case "created":
        return "text-amber-400";
      case "pending":
        return "text-blue-400";
      case "expired":
        return "text-gray-400";
      default:
        return "text-slate-400";
    }
  };

  const statusLabel = (value: string) => {
    switch (value) {
      case "confirmed":
        return paymentMethod === "upi" ? "UPI Confirmed" : "Confirmed";
      case "failed":
        return "Failed";
      case "created":
        return paymentMethod === "upi" ? "UPI Initiated" : "Created";
      case "pending":
        return "Pending";
      case "expired":
        return "Expired";
      default:
        return value;
    }
  };

  return <Badge className={`capitalize ${statusColor(status)}`}>{statusLabel(status)}</Badge>;
};
