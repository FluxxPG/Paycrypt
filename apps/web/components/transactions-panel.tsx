"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { apiFetch } from "../lib/authed-fetch";

type TransactionRow = {
  id: string;
  payment_id: string;
  asset: string;
  network: string;
  amount_crypto: number | string;
  amount_fiat: number | string;
  tx_hash: string;
  confirmations: number;
  status: string;
  created_at: string;
};

const formatTime = (value: string) =>
  new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export const TransactionsPanel = () => {
  const [transactions, setTransactions] = useState<TransactionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    apiFetch<{ data: TransactionRow[] }>("/dashboard/transactions")
      .then((payload) => {
        if (mounted) setTransactions(payload.data);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load transactions");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const summary = useMemo(() => {
    const rows = transactions ?? [];
    return {
      count: rows.length,
      confirmed: rows.filter((row) => row.status === "confirmed").length,
      pending: rows.filter((row) => row.status === "pending").length,
      failed: rows.filter((row) => row.status === "failed").length,
      volume: rows.reduce((sum, row) => sum + Number(row.amount_fiat), 0)
    };
  }, [transactions]);

  if (error) return <Card className="text-rose-300">{error}</Card>;
  if (!transactions) return <Card>Loading transaction ledger...</Card>;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-400">Transactions</p>
          <p className="mt-4 text-3xl font-semibold text-white">{summary.count}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Confirmed</p>
          <p className="mt-4 text-3xl font-semibold text-white">{summary.confirmed}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Pending</p>
          <p className="mt-4 text-3xl font-semibold text-white">{summary.pending}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Volume</p>
          <p className="mt-4 text-3xl font-semibold text-white">INR {summary.volume.toLocaleString("en-IN")}</p>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-lg font-medium text-white">Transaction ledger</p>
            <p className="text-sm text-slate-400">Network confirmations for each on-chain payment.</p>
          </div>
          <Badge>{transactions.length}</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="border-b border-white/10 bg-white/5">
              <tr>
                <th className="px-6 py-4">Payment</th>
                <th className="px-6 py-4">Asset / Network</th>
                <th className="px-6 py-4">Confirmations</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Hash</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((row) => (
                <tr key={row.id} className="border-b border-white/5">
                  <td className="px-6 py-4 text-white">{row.payment_id}</td>
                  <td className="px-6 py-4">
                    {row.asset} / {row.network}
                  </td>
                  <td className="px-6 py-4">{row.confirmations}</td>
                  <td className="px-6 py-4">
                    INR {Number(row.amount_fiat).toLocaleString("en-IN")}
                    <p className="mt-1 text-xs text-slate-500">{Number(row.amount_crypto).toFixed(8)}</p>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-400">{row.tx_hash}</td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <Badge className="capitalize">{row.status}</Badge>
                      <p className="text-xs text-slate-500">{formatTime(row.created_at)}</p>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
