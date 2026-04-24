"use client";

import { useEffect, useState } from "react";
import { getApiBaseUrl } from "../lib/runtime-config";
import { Badge } from "./ui/badge";

type Props = {
  paymentId: string;
  merchantId: string;
  initialStatus: string;
  paymentMethod?: "crypto" | "upi";
};

export const RealtimePayment = ({ paymentId, merchantId, initialStatus, paymentMethod = "crypto" }: Props) => {
  const [status, setStatus] = useState(initialStatus);
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    const wsUrl = `${getApiBaseUrl().replace("http", "ws")}/ws/payments/${paymentId}`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log("WebSocket connected");
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.status) {
        setStatus(data.status);
      }
      // Handle UPI-specific updates
      if (paymentMethod === "upi" && data.upiStatus) {
        setStatus(data.upiStatus);
      }
    };

    socket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    socket.onclose = () => {
      console.log("WebSocket disconnected");
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, [paymentId, paymentMethod]);

  const statusColor = (s: string) => {
    switch (s) {
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

  const statusLabel = (s: string) => {
    switch (s) {
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
        return s;
    }
  };

  return (
    <Badge className={`capitalize ${statusColor(status)}`}>
      {statusLabel(status)}
    </Badge>
  );
};
