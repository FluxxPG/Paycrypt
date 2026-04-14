"use client";

import { useEffect, useState } from "react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { apiFetch } from "../lib/authed-fetch";

type OverviewResponse = {
  metrics: {
    monthlyTransactions: number;
    monthlyVolume: number | string;
    paymentBreakdown: Array<{ status: string; count: number; amount: number | string }>;
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

  if (error) return <Card className="text-rose-300">{error}</Card>;
  if (!data) return <Card>Loading live merchant data...</Card>;

  const paymentStats = data.metrics.paymentBreakdown.reduce<Record<string, { count: number; amount: number }>>(
    (acc, item) => {
      acc[item.status] = { count: Number(item.count), amount: Number(item.amount) };
      return acc;
    },
    {}
  );
  const subscription = data.subscription.subscription;

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-400">Monthly volume</p>
          <p className="mt-4 text-3xl font-semibold text-white">
            INR {Number(data.metrics.monthlyVolume).toLocaleString("en-IN")}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Payments confirmed</p>
          <p className="mt-4 text-3xl font-semibold text-white">{paymentStats.confirmed?.count ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Monthly events</p>
          <p className="mt-4 text-3xl font-semibold text-white">
            {data.subscription.usage.reduce((sum, item) => sum + Number(item.total), 0)}
          </p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Plan</p>
          <p className="mt-4 text-3xl font-semibold text-white capitalize">{subscription?.plan_code ?? "starter"}</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-medium text-white">Payments Overview</p>
              <p className="text-sm text-slate-400">
                Live network activity across custodial and premium non-custodial lanes.
              </p>
            </div>
            <Badge>{subscription?.plan_code ?? "starter"}</Badge>
          </div>
          <div className="mt-6 grid gap-3 text-sm text-slate-300">
            {["created", "pending", "confirmed", "failed"].map((status) => (
              <div key={status} className="glass-soft rounded-2xl p-4">
                {status.charAt(0).toUpperCase() + status.slice(1)}: {paymentStats[status]?.count ?? 0}
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <p className="text-lg font-medium text-white">Wallet Access</p>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            <div className="glass-soft rounded-2xl p-4">Custodial: Binance enabled</div>
            <div className="glass-soft rounded-2xl p-4">TRON / ERC20 / Solana: premium gated</div>
            <div className="glass-soft rounded-2xl p-4">Monthly usage: {data.subscription.usage.length}</div>
          </div>
        </Card>
      </div>
    </>
  );
};
