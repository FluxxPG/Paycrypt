"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, Gauge, ReceiptText, Webhook } from "lucide-react";
import { apiFetch } from "../lib/authed-fetch";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

type ReportsResponse = {
  dailyPayments: Array<{ day: string; count: number; volume: number | string }>;
  statusBreakdown: Array<{ status: string; count: number; volume: number | string }>;
  webhookSummary: { total: number; delivered: number; failed: number };
  webhookLogs: Array<{
    event_type: string;
    response_status: number | null;
    attempt: number;
    delivered_at: string | null;
    next_retry_at: string | null;
    created_at: string;
  }>;
  usageLogs: Array<{ event_type: string; total: number }>;
  transactions: Array<{
    payment_id: string;
    asset: string;
    network: string;
    amount_crypto: number | string;
    amount_fiat: number | string;
    tx_hash: string | null;
    confirmations: number;
    status: string;
    created_at: string;
  }>;
  auditLogs: Array<{
    actor_id: string;
    merchant_id: string | null;
    action: string;
    payload: Record<string, unknown>;
    created_at: string;
  }>;
  failedPayments: Array<{
    id: string;
    status: string;
    created_at: string;
  }>;
};

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", { month: "short", day: "numeric" });

export const ReportsPanel = () => {
  const [data, setData] = useState<ReportsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    apiFetch<ReportsResponse>("/dashboard/reports")
      .then((payload) => {
        if (mounted) setData(payload);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load reports");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const totals = useMemo(() => {
    if (!data) return { volume: 0, payments: 0, webhookRate: 0, confirmed: 0 };
    const volume = data.dailyPayments.reduce((sum, item) => sum + Number(item.volume), 0);
    const payments = data.dailyPayments.reduce((sum, item) => sum + Number(item.count), 0);
    const webhookRate = data.webhookSummary.total
      ? Math.round((data.webhookSummary.delivered / data.webhookSummary.total) * 100)
      : 0;
    const confirmed = data.statusBreakdown.find((item) => item.status === "confirmed")?.count ?? 0;
    return { volume, payments, webhookRate, confirmed };
  }, [data]);

  if (error) return <Card className="text-rose-300">{error}</Card>;
  if (!data) return <Card>Loading merchant reports...</Card>;

  const maxVolume = Math.max(...data.dailyPayments.map((item) => Number(item.volume)), 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-4">
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">14d volume</p>
            <ReceiptText className="h-4 w-4 text-cyan-300" />
          </div>
          <p className="mt-4 text-3xl font-semibold text-white">INR {totals.volume.toLocaleString("en-IN")}</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Payments</p>
            <Activity className="h-4 w-4 text-cyan-300" />
          </div>
          <p className="mt-4 text-3xl font-semibold text-white">{totals.payments}</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Confirmed</p>
            <ArrowUpRight className="h-4 w-4 text-cyan-300" />
          </div>
          <p className="mt-4 text-3xl font-semibold text-white">{totals.confirmed}</p>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-400">Webhook success</p>
            <Webhook className="h-4 w-4 text-cyan-300" />
          </div>
          <p className="mt-4 text-3xl font-semibold text-white">{totals.webhookRate}%</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-white">Payment trend</p>
              <p className="text-sm text-slate-400">Daily count and settled value across the last 14 days.</p>
            </div>
            <Badge>14 days</Badge>
          </div>
          <div className="mt-6 grid grid-cols-7 gap-3">
            {data.dailyPayments.map((item) => {
              const volume = Number(item.volume);
              const height = Math.max(18, (volume / maxVolume) * 140);
              return (
                <div key={item.day} className="flex flex-col items-center gap-2">
                  <div className="flex h-40 w-full items-end rounded-2xl bg-white/5 p-2">
                    <div
                      className="w-full rounded-xl bg-gradient-to-t from-cyan-400 to-fuchsia-400"
                      style={{ height }}
                    />
                  </div>
                  <div className="text-center text-xs text-slate-400">
                    <p>{formatDate(item.day)}</p>
                    <p className="text-slate-200">{item.count}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-white">Webhook delivery</p>
              <p className="text-sm text-slate-400">Recent delivery logs and retry posture.</p>
            </div>
            <Badge>{data.webhookSummary.total}</Badge>
          </div>
          <div className="mt-6 space-y-3 text-sm text-slate-300">
            <div className="glass-soft rounded-2xl p-4">Delivered: {data.webhookSummary.delivered}</div>
            <div className="glass-soft rounded-2xl p-4">Failed: {data.webhookSummary.failed}</div>
            {data.webhookLogs.slice(0, 5).map((log) => (
              <div key={`${log.event_type}-${log.created_at}`} className="glass-soft rounded-2xl p-4">
                <p className="text-white">{log.event_type}</p>
                <p className="mt-1 text-xs text-slate-500">
                  status {log.response_status ?? "n/a"} - attempt {log.attempt}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-lg font-medium text-white">Usage metering</p>
            <Badge>{data.usageLogs.length}</Badge>
          </div>
          <div className="mt-6 space-y-3 text-sm text-slate-300">
            {data.usageLogs.map((item) => (
              <div key={item.event_type} className="glass-soft rounded-2xl p-4">
                {item.event_type}: {item.total}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <p className="text-lg font-medium text-white">Recent settlements</p>
            <Badge>{data.transactions.length}</Badge>
          </div>
          <div className="mt-6 space-y-3 text-sm text-slate-300">
            {data.transactions.slice(0, 8).map((tx) => (
              <div key={`${tx.payment_id}-${tx.created_at}`} className="glass-soft rounded-2xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-white">
                      {tx.asset} / {tx.network}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {Number(tx.amount_crypto).toFixed(8)} - INR {Number(tx.amount_fiat).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <Badge className="capitalize">{tx.status}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <p className="text-lg font-medium text-white">Audit log</p>
          <Badge>{data.auditLogs.length}</Badge>
        </div>
        <div className="mt-6 space-y-3 text-sm text-slate-300">
          {data.auditLogs.slice(0, 6).map((entry) => (
            <div key={`${entry.action}-${entry.created_at}`} className="glass-soft rounded-2xl p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-white">{entry.action}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    actor {entry.actor_id} - {entry.merchant_id ?? "platform"} - {formatDate(entry.created_at)}
                  </p>
                </div>
                <Gauge className="h-4 w-4 text-cyan-300" />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <p className="text-lg font-medium text-white">Failed payments</p>
          <Badge>{data.failedPayments.length}</Badge>
        </div>
        <div className="mt-6 space-y-3 text-sm text-slate-300">
          {data.failedPayments.map((entry) => (
            <div key={entry.id} className="glass-soft rounded-2xl p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-white">{entry.id}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatDate(entry.created_at)}</p>
                </div>
                <Badge className="capitalize">{entry.status}</Badge>
              </div>
            </div>
          ))}
          {data.failedPayments.length === 0 ? <p className="text-sm text-slate-400">No failures in this period.</p> : null}
        </div>
      </Card>
    </div>
  );
};
