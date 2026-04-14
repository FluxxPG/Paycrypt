"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { apiFetch } from "../lib/authed-fetch";

type SettlementRow = {
  id: string;
  payment_id: string;
  transaction_id: string | null;
  provider: string;
  asset: string;
  network: string;
  amount_crypto: number | string;
  amount_fiat: number | string;
  tx_hash: string;
  status: string;
  metadata: Record<string, unknown>;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

const providerLabel = (provider: string) =>
  provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase();

const formatTime = (value: string | null) =>
  value ? new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "n/a";

export const SettlementsPanel = () => {
  const [settlements, setSettlements] = useState<SettlementRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    apiFetch<{ data: SettlementRow[] }>("/dashboard/settlements")
      .then((payload) => {
        if (mounted) setSettlements(payload.data);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load settlements");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const summary = useMemo(() => {
    const rows = settlements ?? [];
    return {
      count: rows.length,
      processed: rows.filter((row) => row.status === "processed").length,
      failed: rows.filter((row) => row.status === "failed").length,
      totalFiat: rows.reduce((sum, row) => sum + Number(row.amount_fiat), 0),
      totalCrypto: rows.reduce((sum, row) => sum + Number(row.amount_crypto), 0)
    };
  }, [settlements]);

  if (error) return <Card className="text-rose-300">{error}</Card>;
  if (!settlements) return <Card>Loading settlements...</Card>;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-400">Settlements</p>
          <p className="mt-4 text-3xl font-semibold text-white">{summary.count}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Processed</p>
          <p className="mt-4 text-3xl font-semibold text-white">{summary.processed}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Fiat volume</p>
          <p className="mt-4 text-3xl font-semibold text-white">INR {summary.totalFiat.toLocaleString("en-IN")}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Crypto volume</p>
          <p className="mt-4 text-3xl font-semibold text-white">{summary.totalCrypto.toFixed(8)}</p>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div>
            <p className="text-lg font-medium text-white">Settlement ledger</p>
            <p className="text-sm text-slate-400">Processed payment settlements recorded by the worker pipeline.</p>
          </div>
          <Badge>{settlements.length}</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="border-b border-white/10 bg-white/5">
              <tr>
                <th className="px-6 py-4">Payment</th>
                <th className="px-6 py-4">Provider</th>
                <th className="px-6 py-4">Asset / Network</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Hash</th>
                <th className="px-6 py-4">Processed</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((settlement) => (
                <tr key={settlement.id} className="border-b border-white/5">
                  <td className="px-6 py-4 text-white">{settlement.payment_id}</td>
                  <td className="px-6 py-4">{providerLabel(settlement.provider)}</td>
                  <td className="px-6 py-4">
                    {settlement.asset} / {settlement.network}
                  </td>
                  <td className="px-6 py-4">
                    INR {Number(settlement.amount_fiat).toLocaleString("en-IN")}
                    <p className="mt-1 text-xs text-slate-500">{Number(settlement.amount_crypto).toFixed(8)}</p>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs text-slate-400">{settlement.tx_hash}</td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <Badge className="capitalize">{settlement.status}</Badge>
                      <p className="text-xs text-slate-500">{formatTime(settlement.processed_at ?? settlement.created_at)}</p>
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
