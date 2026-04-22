"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, CheckCircle2, Layers3, TrendingUp, Wallet } from "lucide-react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { apiFetch } from "../lib/authed-fetch";

type OverviewResponse = {
  metrics: {
    monthlyTransactions: number;
    monthlyVolume: number | string;
    paymentBreakdown: Array<{ status: string; count: number; amount: number | string }>;
    successRate: number;
    settledCount: number;
    unsettledCount: number;
  };
  charts: {
    dailyVolume: Array<{ day: string; count: number; volume: number | string; settled_volume: number | string }>;
    settlementBreakdown: Array<{ settlement_state: string; count: number; volume: number | string }>;
    networkBreakdown: Array<{
      settlement_currency: string;
      network: string;
      wallet_type: string;
      wallet_provider: string;
      count: number;
      volume: number | string;
    }>;
    walletMix: Array<{ wallet_type: string; provider: string; count: number }>;
    dailyUsage: Array<{ day: string; total: number }>;
  };
  recentPayments: Array<{
    id: string;
    payment_status: string;
    settlement_state: string;
    amount_fiat: number | string;
    settlement_currency: string;
    network: string;
    tx_hash: string | null;
    created_at: string;
  }>;
  walletSummary: {
    total: number;
    custodial: number;
    nonCustodial: number;
    custodialEnabled: boolean;
    nonCustodialEnabled: boolean;
  };
  subscription: {
    subscription?: {
      plan_code: string;
      status: string;
      monthly_price_inr: number | string;
      transaction_limit: number;
    };
    usage: Array<{ event_type: string; total: number }>;
  };
};

const formatDay = (value: string) =>
  new Date(value).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const compactHash = (value: string | null) => (value ? `${value.slice(0, 10)}...${value.slice(-10)}` : "Waiting for chain hash");

const HumanBarChart = ({
  data
}: {
  data: Array<{ label: string; value: number; secondary?: number }>;
}) => {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className="flex h-72 items-end gap-3">
      {data.map((item) => {
        const primaryHeight = `${Math.max((item.value / maxValue) * 100, item.value > 0 ? 8 : 0)}%`;
        const secondaryHeight = item.secondary !== undefined ? `${Math.max((item.secondary / maxValue) * 100, item.secondary > 0 ? 8 : 0)}%` : "0%";

        return (
          <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-3">
            <div className="flex h-full w-full items-end justify-center gap-1">
              <div
                className="w-1/2 rounded-t-2xl bg-gradient-to-t from-cyan-500 via-sky-400 to-cyan-200 shadow-[0_0_24px_rgba(34,211,238,0.25)]"
                style={{ height: primaryHeight }}
              />
              {item.secondary !== undefined ? (
                <div
                  className="w-1/2 rounded-t-2xl bg-gradient-to-t from-emerald-500 via-emerald-400 to-emerald-200 shadow-[0_0_24px_rgba(16,185,129,0.2)]"
                  style={{ height: secondaryHeight }}
                />
              ) : null}
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-400">{item.label}</p>
              <p className="mt-1 text-xs text-slate-200">INR {item.value.toLocaleString("en-IN")}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const DashboardOverviewPanel = () => {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    apiFetch<OverviewResponse>("/dashboard/overview")
      .then((payload) => {
        if (mounted) setData(payload);
      })
      .catch((err) => {
        if (mounted) setError(err instanceof Error ? err.message : "Failed to load overview");
      });
    return () => {
      mounted = false;
    };
  }, []);

  const chartData = useMemo(() => {
    if (!data) return null;

    const dailyVolume = data.charts.dailyVolume.map((item) => ({
      label: formatDay(item.day),
      value: Number(item.volume),
      secondary: Number(item.settled_volume)
    }));

    const totalNetworkVolume = Math.max(
      ...data.charts.networkBreakdown.map((item) => Number(item.volume)),
      1
    );

    const usageMax = Math.max(...data.charts.dailyUsage.map((item) => Number(item.total)), 1);

    return {
      dailyVolume,
      networkBars: data.charts.networkBreakdown.map((item) => ({
        ...item,
        width: `${Math.max((Number(item.volume) / totalNetworkVolume) * 100, 6)}%`
      })),
      usageBars: data.charts.dailyUsage.map((item) => ({
        ...item,
        height: `${Math.max((Number(item.total) / usageMax) * 100, item.total > 0 ? 12 : 0)}%`
      }))
    };
  }, [data]);

  if (error) return <Card className="text-rose-300">{error}</Card>;
  if (!data || !chartData) return <Card>Loading live merchant analytics...</Card>;

  const subscription = data.subscription.subscription;
  const paymentVolumeByStatus = data.metrics.paymentBreakdown.reduce((sum, item) => sum + Number(item.amount), 0);
  const usageTotal = data.subscription.usage.reduce((sum, item) => sum + Number(item.total), 0);
  const transactionLimit = Number(subscription?.transaction_limit ?? 0);
  const monthlyUsagePct = transactionLimit > 0 ? Math.min((data.metrics.monthlyTransactions / transactionLimit) * 100, 100) : 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-400">Monthly volume</p>
          <p className="mt-4 text-3xl font-semibold text-white">
            INR {Number(data.metrics.monthlyVolume).toLocaleString("en-IN")}
          </p>
          <p className="mt-2 text-xs text-slate-500">{data.metrics.monthlyTransactions} transactions this month</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Success rate</p>
          <p className="mt-4 text-3xl font-semibold text-white">{data.metrics.successRate}%</p>
          <p className="mt-2 text-xs text-slate-500">{data.metrics.settledCount} settled · {data.metrics.unsettledCount} open</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Active wallets</p>
          <p className="mt-4 text-3xl font-semibold text-white">{data.walletSummary.total}</p>
          <p className="mt-2 text-xs text-slate-500">
            {data.walletSummary.custodial} custodial · {data.walletSummary.nonCustodial} non-custodial
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Plan utilization</p>
          <p className="mt-4 text-3xl font-semibold capitalize text-white">{subscription?.plan_code ?? "unassigned"}</p>
          <div className="mt-3 h-2 rounded-full bg-white/8">
            <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${monthlyUsagePct}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {data.metrics.monthlyTransactions} / {transactionLimit || "unlimited"} monthly transactions
          </p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-white">14-day payment volume</p>
              <p className="text-sm text-slate-400">
                Cyan bars show total quoted inflow. Green bars show already settled volume.
              </p>
            </div>
            <Badge className="border-cyan-400/20 bg-cyan-400/10 text-cyan-200">Live from payment ledger</Badge>
          </div>
          <div className="mt-6">
            <HumanBarChart data={chartData.dailyVolume} />
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-white">Settlement state distribution</p>
              <p className="text-sm text-slate-400">Every state comes directly from the reconciled ledger.</p>
            </div>
            <Layers3 className="h-4 w-4 text-cyan-300" />
          </div>
          <div className="mt-6 space-y-3">
            {data.charts.settlementBreakdown.map((item) => (
              <div key={item.settlement_state} className="glass-soft rounded-2xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm capitalize text-white">{item.settlement_state.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.count} payments · INR {Number(item.volume).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <Badge>{item.count}</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-white">Network and wallet lanes</p>
              <p className="text-sm text-slate-400">Asset, network, and custody routing ranked by processed volume.</p>
            </div>
            <BarChart3 className="h-4 w-4 text-cyan-300" />
          </div>
          <div className="mt-6 space-y-4">
            {chartData.networkBars.map((item) => (
              <div key={`${item.settlement_currency}-${item.network}-${item.wallet_provider}`} className="space-y-2">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <div>
                    <p className="text-white">
                      {item.settlement_currency} / {item.network}
                    </p>
                    <p className="text-xs capitalize text-slate-500">
                      {item.wallet_type.replace("_", " ")} via {item.wallet_provider}
                    </p>
                  </div>
                  <p className="text-xs text-slate-300">
                    INR {Number(item.volume).toLocaleString("en-IN")} · {item.count} payments
                  </p>
                </div>
                <div className="h-3 rounded-full bg-white/8">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500"
                    style={{ width: item.width }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-white">Usage activity</p>
              <p className="text-sm text-slate-400">API and platform events aggregated from usage logs.</p>
            </div>
            <Activity className="h-4 w-4 text-cyan-300" />
          </div>
          <div className="mt-6 flex h-48 items-end gap-3">
            {chartData.usageBars.map((item) => (
              <div key={item.day} className="flex min-w-0 flex-1 flex-col items-center gap-3">
                <div className="flex h-full w-full items-end justify-center">
                  <div
                    className="w-full rounded-t-2xl bg-gradient-to-t from-fuchsia-500 via-violet-400 to-sky-300"
                    style={{ height: item.height }}
                  />
                </div>
                <div className="text-center">
                  <p className="text-xs text-slate-400">{formatDay(item.day)}</p>
                  <p className="mt-1 text-xs text-slate-200">{item.total}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Monthly events</p>
              <p className="mt-2 text-2xl font-semibold text-white">{usageTotal}</p>
            </div>
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Tracked statuses</p>
              <p className="mt-2 text-2xl font-semibold text-white">{data.metrics.paymentBreakdown.length}</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-white">Wallet access</p>
              <p className="text-sm text-slate-400">Availability and provider mix from active wallet records.</p>
            </div>
            <Wallet className="h-4 w-4 text-cyan-300" />
          </div>
          <div className="mt-6 space-y-3 text-sm text-slate-300">
            <div className="glass-soft rounded-2xl p-4">
              Custodial routing: {data.walletSummary.custodialEnabled ? "enabled" : "disabled"}
            </div>
            <div className="glass-soft rounded-2xl p-4">
              Non-custodial routing: {data.walletSummary.nonCustodialEnabled ? "enabled" : "disabled"}
            </div>
            {data.charts.walletMix.map((item) => (
              <div key={`${item.wallet_type}-${item.provider}`} className="glass-soft rounded-2xl p-4">
                <p className="capitalize text-white">{item.wallet_type.replace("_", " ")} · {item.provider}</p>
                <p className="mt-1 text-xs text-slate-500">{item.count} active wallet routes</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-white">Recent payment activity</p>
              <p className="text-sm text-slate-400">Latest ledger entries with realtime settlement and chain references.</p>
            </div>
            <TrendingUp className="h-4 w-4 text-cyan-300" />
          </div>
          <div className="mt-6 space-y-3">
            {data.recentPayments.map((payment) => (
              <div key={payment.id} className="glass-soft rounded-2xl p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-white">{payment.id}</p>
                      <Badge className="capitalize">{payment.payment_status}</Badge>
                      <Badge className="capitalize border-emerald-400/20 bg-emerald-400/10 text-emerald-200">
                        {payment.settlement_state.replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      INR {Number(payment.amount_fiat).toLocaleString("en-IN")} · {payment.settlement_currency} / {payment.network}
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-slate-400">{compactHash(payment.tx_hash)}</p>
                  </div>
                  <div className="text-xs text-slate-500 lg:text-right">
                    <p>{formatDateTime(payment.created_at)}</p>
                    <p className="mt-1">
                      {payment.tx_hash ? (
                        <span className="inline-flex items-center gap-1 text-emerald-300">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Chain hash recorded
                        </span>
                      ) : (
                        "Awaiting verified transaction hash"
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 text-xs text-slate-400">
            Total tracked volume across statuses: INR {paymentVolumeByStatus.toLocaleString("en-IN")}
          </div>
        </Card>
      </div>
    </div>
  );
};
