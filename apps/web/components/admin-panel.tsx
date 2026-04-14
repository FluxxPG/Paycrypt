"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, FileText, Gauge, Server, ShieldCheck, Webhook } from "lucide-react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { apiFetch } from "../lib/authed-fetch";

type Merchant = {
  id: string;
  name: string;
  slug: string;
  email: string;
  status: string;
  custodial_enabled: boolean;
  non_custodial_enabled: boolean;
  plan_code: string | null;
  subscription_status: string | null;
};

type QueueCounts = {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
};

type Analytics = {
  merchants: number;
  payments: Array<{ status: string; count: number; volume: number | string }>;
  revenue: Array<{ plan_code: string; merchants: number; mrr: number | string }>;
  monitoring: {
    queues: {
      confirmations: QueueCounts;
      webhooks: QueueCounts;
      settlements: QueueCounts;
    };
    webhookSummary: { total: number; delivered: number; failed: number };
    settlementSummary: { total: number; processed: number; volume: number | string };
    recentAuditLogs: Array<{
      actor_id: string;
      merchant_id: string | null;
      action: string;
      payload: Record<string, unknown>;
      created_at: string;
    }>;
    recentWebhookLogs: Array<{
      merchant_id: string;
      event_type: string;
      response_status: number | null;
      attempt: number;
      delivered_at: string | null;
      next_retry_at: string | null;
      created_at: string;
    }>;
    telemetry: {
      httpRequestsTotal: number;
      httpClientErrorsTotal: number;
      httpServerErrorsTotal: number;
      httpLatencyMsAverage: number;
      authJwtSuccessTotal: number;
      authJwtFailureTotal: number;
      authApiKeySuccessTotal: number;
      authApiKeyFailureTotal: number;
      rateLimitedTotal: number;
      idempotencyHitsTotal: number;
      paymentCreatedTotal: number;
      paymentPendingTotal: number;
      paymentConfirmedTotal: number;
      paymentFailedTotal: number;
      paymentExpiredTotal: number;
      webhookDeliveredTotal: number;
      webhookFailedTotal: number;
      settlementProcessedTotal: number;
      settlementFailedTotal: number;
      workerJobsCompletedTotal: number;
      workerJobsFailedTotal: number;
    };
  };
};

const formatTime = (value: string) =>
  new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });

export const AdminPanel = () => {
  const [merchants, setMerchants] = useState<Merchant[] | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>("");
  const [selectedPlan, setSelectedPlan] = useState<"starter" | "business" | "premium" | "custom">("business");
  const [customMonthlyPriceInr, setCustomMonthlyPriceInr] = useState("0");
  const [customTransactionLimit, setCustomTransactionLimit] = useState("0");
  const [customSetupFeeInr, setCustomSetupFeeInr] = useState("0");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([apiFetch<{ data: Merchant[] }>("/admin/merchants"), apiFetch<Analytics>("/admin/analytics")]).then(
      ([merchantPayload, analyticsPayload]) => {
        if (!mounted) return;
        setMerchants(merchantPayload.data);
        setAnalytics(analyticsPayload);
        setSelectedMerchantId(merchantPayload.data[0]?.id ?? "");
      }
    );
    return () => {
      mounted = false;
    };
  }, []);

  const selectedMerchant = useMemo(
    () => merchants?.find((merchant) => merchant.id === selectedMerchantId) ?? null,
    [merchants, selectedMerchantId]
  );

  const queueBacklog = useMemo(() => {
    if (!analytics) return 0;
    return Object.values(analytics.monitoring.queues).reduce(
      (sum, queue) => sum + queue.waiting + queue.active + queue.delayed,
      0
    );
  }, [analytics]);

  const failedJobs = useMemo(() => {
    if (!analytics) return 0;
    return Object.values(analytics.monitoring.queues).reduce((sum, queue) => sum + queue.failed, 0);
  }, [analytics]);

  const completedJobs = useMemo(() => {
    if (!analytics) return 0;
    return Object.values(analytics.monitoring.queues).reduce((sum, queue) => sum + queue.completed, 0);
  }, [analytics]);

  const webhookSuccessRate = useMemo(() => {
    if (!analytics?.monitoring.webhookSummary.total) return 0;
    return Math.round(
      (analytics.monitoring.webhookSummary.delivered / analytics.monitoring.webhookSummary.total) * 100
    );
  }, [analytics]);

  const toggleNonCustodialFor = async (merchantId: string, enabled: boolean) => {
    setBusy(true);
    try {
      await apiFetch(`/admin/merchants/${merchantId}/non-custodial`, {
        method: "POST",
        body: JSON.stringify({ enabled })
      });
      const payload = await apiFetch<{ data: Merchant[] }>("/admin/merchants");
      setMerchants(payload.data);
    } finally {
      setBusy(false);
    }
  };

  const toggleNonCustodial = async () => {
    if (!selectedMerchant) return;
    await toggleNonCustodialFor(selectedMerchant.id, !selectedMerchant.non_custodial_enabled);
  };

  const updatePlan = async () => {
    if (!selectedMerchant) return;
    setBusy(true);
    try {
      await apiFetch(`/admin/merchants/${selectedMerchant.id}/subscription`, {
        method: "POST",
        body: JSON.stringify({
          planCode: selectedPlan,
          monthlyPriceInr: selectedPlan === "custom" ? Number(customMonthlyPriceInr) : undefined,
          transactionLimit: selectedPlan === "custom" ? Number(customTransactionLimit) : undefined,
          setupFeeInr: selectedPlan === "custom" ? Number(customSetupFeeInr) : undefined
        })
      });
      const payload = await apiFetch<{ data: Merchant[] }>("/admin/merchants");
      setMerchants(payload.data);
    } finally {
      setBusy(false);
    }
  };

  if (!merchants || !analytics) return <Card>Loading admin data...</Card>;

  const telemetry = analytics.monitoring.telemetry;
  const authFailures = telemetry.authJwtFailureTotal + telemetry.authApiKeyFailureTotal;
  const requestErrors = telemetry.httpClientErrorsTotal + telemetry.httpServerErrorsTotal;
  const requestErrorRate = telemetry.httpRequestsTotal
    ? Math.round((requestErrors / telemetry.httpRequestsTotal) * 100)
    : 0;

  const paymentStats = analytics.payments.reduce<Record<string, { count: number; volume: number }>>((acc, item) => {
    acc[item.status] = { count: Number(item.count), volume: Number(item.volume) };
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Admin services</h2>
            <p className="text-sm text-slate-400">Jump into any control surface from the command deck.</p>
          </div>
          <Badge>Super Admin</Badge>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {[
            { label: "Merchants", href: "/admin/merchants" },
            { label: "Subscriptions", href: "/admin/subscriptions" },
            { label: "Wallets", href: "/admin/wallets" },
            { label: "API Keys", href: "/admin/api-keys" },
            { label: "Webhooks", href: "/admin/webhooks" },
            { label: "Revenue", href: "/admin/revenue" },
            { label: "Risk & Alerts", href: "/admin/risk" }
          ].map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="glass-soft rounded-2xl px-4 py-3 text-sm text-slate-200 transition hover:bg-white/10"
            >
              {item.label}
            </a>
          ))}
        </div>
      </Card>
      <div id="overview" className="grid gap-6 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-400">Merchants</p>
          <p className="mt-4 text-3xl font-semibold text-white">{analytics.merchants}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Confirmed payments</p>
          <p className="mt-4 text-3xl font-semibold text-white">{paymentStats.confirmed?.count ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Queue backlog</p>
          <p className="mt-4 text-3xl font-semibold text-white">{queueBacklog}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Webhook success</p>
          <p className="mt-4 text-3xl font-semibold text-white">{webhookSuccessRate}%</p>
        </Card>
      </div>

      <Card id="controls">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Live merchant controls</h2>
            <p className="text-sm text-slate-400">
              Change plan tier or toggle non-custodial access for a specific merchant.
            </p>
          </div>
          <Badge>Super Admin</Badge>
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr_1fr]">
          <div>
            <label className="mb-2 block text-sm text-slate-300">Merchant</label>
            <select
              value={selectedMerchantId}
              onChange={(event) => setSelectedMerchantId(event.target.value)}
              className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
            >
              {merchants.map((merchant) => (
                <option key={merchant.id} value={merchant.id} className="bg-slate-900">
                  {merchant.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm text-slate-300">Plan</label>
            <select
              value={selectedPlan}
              onChange={(event) => setSelectedPlan(event.target.value as typeof selectedPlan)}
              className="glass-soft w-full rounded-xl px-4 py-3 text-sm text-slate-100 outline-none"
            >
              <option value="starter" className="bg-slate-900">
                Starter
              </option>
              <option value="business" className="bg-slate-900">
                Business
              </option>
              <option value="premium" className="bg-slate-900">
                Premium
              </option>
              <option value="custom" className="bg-slate-900">
                Custom
              </option>
            </select>
          </div>
          <div className="flex flex-col justify-end gap-3 sm:flex-row">
            <Button variant="secondary" onClick={toggleNonCustodial} disabled={!selectedMerchant || busy}>
              {selectedMerchant?.non_custodial_enabled ? "Disable NC" : "Enable NC"}
            </Button>
            <Button onClick={updatePlan} disabled={!selectedMerchant || busy}>
              Update plan
            </Button>
          </div>
        </div>
        {selectedPlan === "custom" ? (
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div>
              <label className="mb-2 block text-sm text-slate-300">Monthly price INR</label>
              <Input value={customMonthlyPriceInr} onChange={(e) => setCustomMonthlyPriceInr(e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-300">Transaction limit</label>
              <Input value={customTransactionLimit} onChange={(e) => setCustomTransactionLimit(e.target.value)} />
            </div>
            <div>
              <label className="mb-2 block text-sm text-slate-300">Setup fee INR</label>
              <Input value={customSetupFeeInr} onChange={(e) => setCustomSetupFeeInr(e.target.value)} />
            </div>
          </div>
        ) : null}
        {selectedMerchant ? (
          <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
            <div className="glass-soft rounded-2xl p-4">Selected: {selectedMerchant.name}</div>
            <div className="glass-soft rounded-2xl p-4">Plan: {selectedMerchant.plan_code ?? "custom"}</div>
            <div className="glass-soft rounded-2xl p-4">
              Non-custodial: {selectedMerchant.non_custodial_enabled ? "enabled" : "disabled"}
            </div>
          </div>
        ) : null}
      </Card>

      <div id="revenue" className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">Merchant access controls</h2>
            <Badge>Super Admin</Badge>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            {merchants.slice(0, 4).map((merchant) => (
              <div key={merchant.id} className="glass-soft rounded-2xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-white">{merchant.name}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {merchant.plan_code ?? "custom"} - {merchant.non_custodial_enabled ? "non-custodial enabled" : "custodial only"}
                    </p>
                  </div>
                  <ShieldCheck className="h-4 w-4 text-cyan-300" />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">Revenue mix</h2>
            <Badge>{analytics.revenue.length} plans</Badge>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            {analytics.revenue.map((item) => (
              <div key={item.plan_code} className="glass-soft rounded-2xl p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-white capitalize">{item.plan_code}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {item.merchants} merchants - INR {Number(item.mrr).toLocaleString("en-IN")} MRR
                    </p>
                  </div>
                  <Gauge className="h-4 w-4 text-cyan-300" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card id="merchants">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Merchant directory</h2>
            <p className="text-sm text-slate-400">Live status, plan, and wallet entitlements for every merchant.</p>
          </div>
          <Badge>{merchants.length} total</Badge>
        </div>
        <div className="mt-6 grid gap-3">
          {merchants.map((merchant) => (
            <div key={merchant.id} className="glass-soft rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-white">{merchant.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{merchant.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
                  <span className="glass-soft rounded-full px-3 py-1 capitalize">{merchant.plan_code ?? "custom"}</span>
                  <span className="glass-soft rounded-full px-3 py-1">{merchant.status}</span>
                  <span className="glass-soft rounded-full px-3 py-1">
                    Custodial {merchant.custodial_enabled ? "on" : "off"}
                  </span>
                  <span className="glass-soft rounded-full px-3 py-1">
                    Non-custodial {merchant.non_custodial_enabled ? "on" : "off"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => toggleNonCustodialFor(merchant.id, !merchant.non_custodial_enabled)}
                    disabled={busy}
                  >
                    {merchant.non_custodial_enabled ? "Revoke NC" : "Approve NC"}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div id="operations" className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Queue health</h2>
              <p className="text-sm text-slate-400">BullMQ job health across confirmations, webhooks, and settlements.</p>
            </div>
            <Badge>{failedJobs} failed</Badge>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {(
              [
                ["confirmations", analytics.monitoring.queues.confirmations],
                ["webhooks", analytics.monitoring.queues.webhooks],
                ["settlements", analytics.monitoring.queues.settlements]
              ] as const
            ).map(([label, queue]) => (
              <div key={label} className="glass-soft rounded-2xl p-4">
                <p className="text-sm text-slate-100 capitalize">{label}</p>
                <div className="mt-3 space-y-2 text-xs text-slate-400">
                  <p>Waiting: {queue.waiting}</p>
                  <p>Active: {queue.active}</p>
                  <p>Delayed: {queue.delayed}</p>
                  <p>Failed: {queue.failed}</p>
                  <p>Completed: {queue.completed}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Completed jobs</p>
              <p className="mt-2 text-2xl font-semibold text-white">{completedJobs}</p>
            </div>
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Backlog</p>
              <p className="mt-2 text-2xl font-semibold text-white">{queueBacklog}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Settlements</p>
              <p className="mt-2 text-2xl font-semibold text-white">{analytics.monitoring.settlementSummary.total}</p>
            </div>
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Processed</p>
              <p className="mt-2 text-2xl font-semibold text-white">{analytics.monitoring.settlementSummary.processed}</p>
            </div>
            <div className="glass-soft rounded-2xl p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Volume</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                INR {Number(analytics.monitoring.settlementSummary.volume).toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Webhook delivery</h2>
              <p className="text-sm text-slate-400">Live webhook throughput and retry posture.</p>
            </div>
            <Badge>{webhookSuccessRate}%</Badge>
          </div>
          <div className="mt-6 space-y-3 text-sm text-slate-300">
            <div className="glass-soft rounded-2xl p-4">
              <div className="flex items-center justify-between gap-4">
                <span>Delivered</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-300" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-white">{analytics.monitoring.webhookSummary.delivered}</p>
            </div>
            <div className="glass-soft rounded-2xl p-4">
              <div className="flex items-center justify-between gap-4">
                <span>Failed</span>
                <AlertTriangle className="h-4 w-4 text-rose-300" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-white">{analytics.monitoring.webhookSummary.failed}</p>
            </div>
            <div className="glass-soft rounded-2xl p-4">
              <div className="flex items-center justify-between gap-4">
                <span>Total events</span>
                <Webhook className="h-4 w-4 text-cyan-300" />
              </div>
              <p className="mt-2 text-2xl font-semibold text-white">{analytics.monitoring.webhookSummary.total}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card id="telemetry">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-white">Platform telemetry</h2>
            <p className="text-sm text-slate-400">Redis-backed counters for API pressure, auth, and lifecycle events.</p>
          </div>
          <Badge>{requestErrorRate}% errors</Badge>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">HTTP requests</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.httpRequestsTotal}</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Avg latency</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.httpLatencyMsAverage.toFixed(1)} ms</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Auth failures</p>
            <p className="mt-2 text-2xl font-semibold text-white">{authFailures}</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Idempotency hits</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.idempotencyHitsTotal}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Payments created</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.paymentCreatedTotal}</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Payments confirmed</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.paymentConfirmedTotal}</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Webhooks delivered</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.webhookDeliveredTotal}</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Settlements processed</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.settlementProcessedTotal}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Rate limited</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.rateLimitedTotal}</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Payments pending</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.paymentPendingTotal}</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Worker jobs completed</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.workerJobsCompletedTotal}</p>
          </div>
          <div className="glass-soft rounded-2xl p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">Worker jobs failed</p>
            <p className="mt-2 text-2xl font-semibold text-white">{telemetry.workerJobsFailedTotal}</p>
          </div>
        </div>
      </Card>

      <div id="audit" className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Recent audit log</h2>
              <p className="text-sm text-slate-400">Platform mutations and merchant entitlement changes.</p>
            </div>
            <Badge>{analytics.monitoring.recentAuditLogs.length}</Badge>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            {analytics.monitoring.recentAuditLogs.slice(0, 6).map((entry) => (
              <div key={`${entry.action}-${entry.created_at}`} className="glass-soft rounded-2xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-white">{entry.action}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      actor {entry.actor_id} - {entry.merchant_id ?? "platform"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">{formatTime(entry.created_at)}</p>
                  </div>
                  <Clock3 className="h-4 w-4 text-cyan-300" />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-white">Recent webhook logs</h2>
              <p className="text-sm text-slate-400">Delivery attempts with retry telemetry.</p>
            </div>
            <Badge>{analytics.monitoring.recentWebhookLogs.length}</Badge>
          </div>
          <div className="mt-4 space-y-3 text-sm text-slate-300">
            {analytics.monitoring.recentWebhookLogs.slice(0, 6).map((entry) => (
              <div key={`${entry.event_type}-${entry.created_at}`} className="glass-soft rounded-2xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-white">{entry.event_type}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      status {entry.response_status ?? "n/a"} - attempt {entry.attempt}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatTime(entry.created_at)}
                      {entry.next_retry_at ? ` - retry ${formatTime(entry.next_retry_at)}` : ""}
                    </p>
                  </div>
                  <FileText className="h-4 w-4 text-cyan-300" />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};
