"use client";

import { useEffect, useState } from "react";
import { Card } from "./ui/card";
import { RealtimePayment } from "./realtime-payment";
import { apiFetch } from "../lib/authed-fetch";

type Payment = {
  id: string;
  merchant_id: string;
  amount_fiat: number | string;
  fiat_currency: string;
  settlement_currency: string;
  network: string;
  customer_email: string | null;
  customer_name: string | null;
  description: string;
  status: string;
  confirmations: number;
  tx_hash: string | null;
  wallet_address: string;
  created_at: string;
};

export const DashboardPaymentsPanel = () => {
  const [rows, setRows] = useState<Payment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    apiFetch<{ data: Payment[] }>("/dashboard/payments")
      .then((payload) => mounted && setRows(payload.data))
      .catch((err) => mounted && setError(err instanceof Error ? err.message : "Failed to load payments"));
    return () => {
      mounted = false;
    };
  }, []);

  if (error) return <Card className="text-rose-300">{error}</Card>;
  if (!rows) return <Card>Loading payment ledger...</Card>;

  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-left text-sm text-slate-300">
        <thead className="border-b border-white/10 bg-white/5">
          <tr>
            <th className="px-6 py-4">Payment</th>
            <th className="px-6 py-4">Asset / Network</th>
            <th className="px-6 py-4">Amount</th>
            <th className="px-6 py-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((payment) => (
            <tr key={payment.id} className="border-b border-white/5">
              <td className="px-6 py-4 text-white">{payment.id}</td>
              <td className="px-6 py-4">
                {payment.settlement_currency} / {payment.network}
              </td>
              <td className="px-6 py-4">INR {Number(payment.amount_fiat).toLocaleString("en-IN")}</td>
              <td className="px-6 py-4">
                <RealtimePayment
                  paymentId={payment.id}
                  merchantId={payment.merchant_id}
                  initialStatus={payment.status}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
};
